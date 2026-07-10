import { statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadConfigFile } from "./config.js";
import {
  checkArtifact,
  formatRouteDiff,
  generate,
  type GenerateInputs,
} from "./generate.js";
import {
  type AcquireLockResult,
  acquireWatcherLock,
  watcherLockPath,
} from "./lock.js";
import { DEFAULT_PAGE_EXTENSIONS, resolveAppDir } from "./scan-app.js";
import { watchAppDir } from "./watch.js";

/** @internal I/O seams for tests; defaults write to the console. */
export interface CliIo {
  /** Aborting stops `--watch` and resolves `runCli` with 0. */
  signal?: AbortSignal;
  stderr?: (line: string) => void;
  stdout?: (line: string) => void;
}

/** Flag values as parseArgs produces them. */
interface CliFlags {
  "app-dir"?: string;
  check: boolean;
  "out-file"?: string;
  "page-extensions"?: string;
  watch: boolean;
}

const USAGE = [
  "Usage: paramour generate [options]",
  "",
  "Generate paramour-env.d.ts from the app directory.",
  "",
  "Options:",
  "  --app-dir <dir>           app directory (default: app/ or src/app/)",
  "  --check                   verify the artifact is current; exit 1 on drift, never writes",
  "  --help, -h                show this help",
  "  --out-file <file>         artifact path (default: paramour-env.d.ts)",
  "  --page-extensions <list>  comma-separated, no leading dots (default: tsx,ts,jsx,js)",
  "  --watch                   regenerate on app-dir changes",
].join("\n");

/**
 * @internal The CLI (TR7), in-process testable: returns the exit code
 * instead of exiting. Codes are grep-style so CI can tell drift from
 * breakage: 0 success, 1 `--check` drift ONLY, 2 usage/config/operational
 * errors. Unlike the wrapper's never-load-bearing stance (§7.3), the CLI
 * fails loudly — running it is explicit user intent.
 */
export async function runCli(
  argv: readonly string[],
  io: CliIo = {},
): Promise<number> {
  const stdout =
    io.stdout ??
    ((line: string) => {
      console.log(line);
    });
  const stderr =
    io.stderr ??
    ((line: string) => {
      console.error(line);
    });

  let flags: CliFlags & { help: boolean };
  let positionals: string[];
  try {
    ({ positionals, values: flags } = parseArgs({
      allowPositionals: true,
      args: [...argv],
      options: {
        "app-dir": { type: "string" },
        check: { default: false, type: "boolean" },
        help: { default: false, short: "h", type: "boolean" },
        "out-file": { type: "string" },
        "page-extensions": { type: "string" },
        watch: { default: false, type: "boolean" },
      },
    }));
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    stderr(USAGE);
    return 2;
  }
  if (flags.help) {
    stdout(USAGE);
    return 0;
  }
  if (positionals.length !== 1 || positionals[0] !== "generate") {
    stderr("paramour: expected exactly one command: `paramour generate`");
    stderr(USAGE);
    return 2;
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

/** Error message without the stack — CLI output, not a crash report. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `--page-extensions tsx,mdx` → `["tsx", "mdx"]`; empty list is an error. */
function parsePageExtensions(flag: string | undefined): string[] | undefined {
  if (flag === undefined) return undefined;
  const list = flag
    .split(",")
    .map((ext) => ext.trim())
    .filter((ext) => ext !== "");
  if (list.length === 0) {
    throw new Error("--page-extensions requires a comma-separated list");
  }
  // Mirrors the config-file validation: a leading dot silently matches
  // nothing (`page..tsx` never exists on disk).
  const dotted = list.find((ext) => ext.startsWith("."));
  if (dotted !== undefined) {
    throw new Error(
      `--page-extensions entries must not start with a dot: "${dotted}"`,
    );
  }
  return list;
}

/**
 * Precedence lives in exactly this function (TR7 / §7.2): flags → config
 * file → inference. Paths resolve against the project root (= cwd, where
 * `next` itself would run).
 */
async function resolveInputs(
  flags: CliFlags,
  projectRoot: string,
): Promise<GenerateInputs> {
  const file = (await loadConfigFile(projectRoot))?.config;
  const explicitAppDir = flags["app-dir"] ?? file?.appDir;
  let appDir: string;
  if (explicitAppDir === undefined) {
    const discovered = resolveAppDir(projectRoot);
    if (discovered === undefined) {
      throw new Error(
        `no app directory (app/ or src/app/) under ${projectRoot}; pass --app-dir or set appDir in paramour.config`,
      );
    }
    appDir = discovered;
  } else {
    appDir = resolve(projectRoot, explicitAppDir);
    if (!statSync(appDir, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`app directory not found: ${appDir}`);
    }
  }
  return {
    appDir,
    artifactPath: resolve(
      projectRoot,
      flags["out-file"] ?? file?.outFile ?? "paramour-env.d.ts",
    ),
    pageExtensions:
      parsePageExtensions(flags["page-extensions"]) ??
      file?.pageExtensions ??
      DEFAULT_PAGE_EXTENSIONS,
  };
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
  const diff = formatRouteDiff(result.appeared, result.disappeared);
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
  const count = `${String(result.routes.length)} route${result.routes.length === 1 ? "" : "s"}`;
  stdout(
    result.written
      ? `paramour: wrote ${inputs.artifactPath} (${count})`
      : `paramour: ${inputs.artifactPath} unchanged (${count})`,
  );
  return 0;
}

/**
 * `--watch` (TR7): TR5 watcher behind the TR6 lock. A declined lock exits 0
 * — another live watcher (usually `next dev`) is the designed dedupe case,
 * and the initial generation already ran. Without an abort signal the
 * returned promise stays pending; the process lives via the FSWatcher ref
 * and dies with the standard signal exits (lock.ts re-raises after cleanup).
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
    // Transient I/O failure shouldn't kill an editor-companion watcher;
    // only option-resolution errors (earlier) are fatal.
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
  let warned = false;
  const watcher = watchAppDir(inputs.appDir, {
    ignorePaths: [inputs.artifactPath],
    onError: (error) => {
      if (warned) return;
      warned = true;
      stderr(`paramour: watcher error; continuing: ${message(error)}`);
    },
    onRescan: () => {
      generate(inputs);
    },
  });
  stdout(`paramour: watching ${inputs.appDir}`);
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
