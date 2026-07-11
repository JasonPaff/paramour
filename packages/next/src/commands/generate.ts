import { parseCommandFlags } from "../cli-args.js";
import { resolveInputs } from "../cli-inputs.js";
import { type CliIo, message, resolveIo } from "../cli-io.js";
import { RouteCollisionError } from "../collisions.js";
import {
  checkArtifact,
  formatRouteDiff,
  generate,
  type GenerateInputs,
  type GenerateResult,
} from "../generate.js";
import {
  type AcquireLockResult,
  acquireWatcherLock,
  watcherLockPath,
} from "../lock.js";
import { watchRouteDirs } from "../watch.js";

/** Flag values as parseArgs produces them; `check` mode pins check/watch. */
interface GenerateFlags {
  "app-dir"?: string;
  check: boolean;
  help: boolean;
  "out-file"?: string;
  "page-extensions"?: string;
  "pages-dir"?: string;
  watch: boolean;
}

const SHARED_OPTIONS = {
  "app-dir": { type: "string" },
  help: { default: false, short: "h", type: "boolean" },
  "out-file": { type: "string" },
  "page-extensions": { type: "string" },
  "pages-dir": { type: "string" },
} as const;

const SHARED_OPTION_LINES = [
  "  --app-dir <dir>           app directory (default: discovered app/ or src/app/)",
  "  --help, -h                show this help",
  "  --out-file <file>         artifact path (default: paramour-env.d.ts)",
  "  --page-extensions <list>  comma-separated, no leading dots (default: tsx,ts,jsx,js)",
  "  --pages-dir <dir>         pages directory (default: discovered pages/ or src/pages/)",
];

const GENERATE_USAGE = [
  "Usage: paramour generate [options]",
  "",
  "Generate paramour-env.d.ts from the app and pages directories.",
  "",
  "Options:",
  ...SHARED_OPTION_LINES,
  "  --check                   verify the artifact is current; exit 1 on drift, never writes",
  "  --watch                   regenerate on route-dir changes",
].join("\n");

const CHECK_USAGE = [
  "Usage: paramour check [options]",
  "",
  "Verify the artifact is current; exit 1 on drift, never writes.",
  "",
  "Options:",
  ...SHARED_OPTION_LINES,
].join("\n");

/**
 * @internal `paramour generate` and its `check` alias (TR7), in-process
 * testable: returns the exit code instead of exiting. Codes are grep-style
 * so CI can tell drift from breakage: 0 success, 1 check-drift ONLY, 2
 * usage/config/operational errors — route collisions included (PR9: Next
 * itself fails that build, so there is no artifact to emit). Unlike the
 * wrapper's never-load-bearing stance (§7.3), the CLI fails loudly —
 * running it is explicit user intent.
 */
export async function runGenerate(
  argv: readonly string[],
  io: CliIo,
  mode: "check" | "generate",
): Promise<number> {
  const { stderr, stdout } = resolveIo(io);
  const usage = mode === "check" ? CHECK_USAGE : GENERATE_USAGE;

  let flags: GenerateFlags;
  if (mode === "generate") {
    const parsed = parseCommandFlags(
      argv,
      {
        ...SHARED_OPTIONS,
        check: { default: false, type: "boolean" },
        watch: { default: false, type: "boolean" },
      },
      usage,
      { stderr, stdout },
    );
    if ("exit" in parsed) return parsed.exit;
    flags = parsed.values;
  } else {
    // `check` omits --check/--watch entirely: `paramour check --watch`
    // fails as an unknown option, which is the right message for it.
    const parsed = parseCommandFlags(argv, SHARED_OPTIONS, usage, {
      stderr,
      stdout,
    });
    if ("exit" in parsed) return parsed.exit;
    flags = { ...parsed.values, check: true, watch: false };
  }
  if (flags.watch && flags.check) {
    stderr("paramour: --watch and --check are mutually exclusive");
    return 2;
  }

  const projectRoot = process.cwd();
  let inputs: GenerateInputs;
  try {
    inputs = await resolveInputs(flags, projectRoot);
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }

  if (flags.check) return runCheck(inputs, stdout, stderr);
  if (flags.watch) return runWatch(inputs, projectRoot, io, stdout, stderr);
  return runOnce(inputs, stdout, stderr);
}

function count(n: number, noun: string): string {
  return `${String(n)} ${noun}${n === 1 ? "" : "s"}`;
}

/** `(2 app routes, 1 pages route)` — per-router so hybrid output reads. */
function describeRoutes(result: GenerateResult): string {
  const parts = [
    ...(result.appRoutes.length > 0
      ? [count(result.appRoutes.length, "app route")]
      : []),
    ...(result.pagesRoutes.length > 0
      ? [count(result.pagesRoutes.length, "pages route")]
      : []),
  ];
  return parts.length === 0 ? "0 routes" : parts.join(", ");
}

/** `--check` (TR7): exit 1 on any drift, including a missing artifact. */
function runCheck(
  inputs: GenerateInputs,
  stdout: (line: string) => void,
  stderr: (line: string) => void,
): number {
  let result;
  try {
    result = checkArtifact(inputs);
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }
  if (result.upToDate) {
    stdout(`paramour: ${inputs.artifactPath} is up to date`);
    return 0;
  }
  stderr(
    result.missingFile
      ? `paramour: ${inputs.artifactPath} is missing.`
      : `paramour: ${inputs.artifactPath} is out of date.`,
  );
  const diff = formatRouteDiff(result.app, result.pages);
  if (diff.length === 0) {
    // Byte drift with an identical route set — a hand-edited artifact.
    stderr("  content differs from generator output");
  }
  for (const line of diff) stderr(line);
  stderr("Run `paramour generate` and commit the result.");
  return 1;
}

/** One-shot `paramour generate` (TR7). */
function runOnce(
  inputs: GenerateInputs,
  stdout: (line: string) => void,
  stderr: (line: string) => void,
): number {
  let result;
  try {
    result = generate(inputs);
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }
  const described = describeRoutes(result);
  stdout(
    result.written
      ? `paramour: wrote ${inputs.artifactPath} (${described})`
      : `paramour: ${inputs.artifactPath} unchanged (${described})`,
  );
  return 0;
}

/**
 * `--watch` (TR7): TR5 watcher behind the TR6 lock, over both route dirs
 * (PR8). A declined lock exits 0 — another live watcher (usually `next dev`)
 * is the designed dedupe case, and the initial generation already ran.
 * Without an abort signal the returned promise stays pending; the process
 * lives via the FSWatcher refs and dies with the standard signal exits
 * (lock.ts re-raises after cleanup).
 */
function runWatch(
  inputs: GenerateInputs,
  projectRoot: string,
  io: CliIo,
  stdout: (line: string) => void,
  stderr: (line: string) => void,
): number | Promise<number> {
  try {
    generate(inputs);
  } catch (error) {
    // Transient I/O failure (or a collision the user is mid-fixing)
    // shouldn't kill an editor-companion watcher; only option-resolution
    // errors (earlier) are fatal.
    stderr(`paramour: initial generation failed: ${message(error)}`);
  }
  let lock: AcquireLockResult;
  try {
    lock = acquireWatcherLock(watcherLockPath(projectRoot));
  } catch (error) {
    // A corrupt lock location (e.g. a directory at the pidfile path) is an
    // operational error, not a crash: exit 2 like every other one (TR7).
    stderr(`paramour: ${message(error)}`);
    return 2;
  }
  if (!lock.acquired) {
    stdout(
      `paramour: watcher already running (pid ${String(lock.ownerPid)}); exiting`,
    );
    return 0;
  }
  const dirs = [inputs.appDir, inputs.pagesDir].filter(
    (dir): dir is string => dir !== undefined,
  );
  let warned = false;
  const watcher = watchRouteDirs(dirs, {
    ignorePaths: [inputs.artifactPath],
    onError: (error) => {
      if (warned) return;
      warned = true;
      stderr(`paramour: watcher error; continuing: ${message(error)}`);
    },
    onRescan: () => {
      try {
        generate(inputs);
      } catch (error) {
        if (error instanceof RouteCollisionError) {
          // PR9's watch exception: a collision mid-watch is usually a file
          // mid-move — log loudly every time, keep the last good artifact
          // on disk, keep running (TR5).
          stderr(
            `paramour: ${message(error)}; keeping the last good artifact and watching for the fix`,
          );
          return;
        }
        throw error; // routed to onError by the watcher (TR5 non-fatal)
      }
    },
  });
  stdout(`paramour: watching ${dirs.join(", ")}`);
  return new Promise<number>((resolveExit) => {
    const stop = (): void => {
      watcher.close();
      lock.release?.();
      resolveExit(0);
    };
    if (io.signal?.aborted) {
      stop();
      return;
    }
    io.signal?.addEventListener("abort", stop, { once: true });
  });
}
