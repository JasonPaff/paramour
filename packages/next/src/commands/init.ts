import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { parseCommandFlags } from "../cli-args.js";
import { NoRouteDirsError, resolveInputs } from "../cli-inputs.js";
import { type CliIo, message, resolveIo } from "../cli-io.js";
import { CONFIG_FILE_NAMES, loadConfigFile } from "../config.js";
import { generate } from "../generate.js";
import {
  addPackageScript,
  checkSetup,
  paramourConfigTemplate,
} from "../init/scaffold.js";
import {
  findNextConfig,
  manualSnippet,
  wrapNextConfigSource,
} from "../init/wrap-next-config.js";
import { scanRoutes } from "../scan.js";

const USAGE = [
  "Usage: paramour init [options]",
  "",
  "Set up paramour in this project: scaffold paramour.config.ts, wrap",
  'next.config with withTypedRoutes, add a "paramour" script, and run the',
  "first generate. Every step is idempotent and individually skippable.",
  "",
  "Options:",
  "  --dry-run      report every step without writing anything",
  "  --force        overwrite an existing paramour.config with the scaffold",
  "  --help, -h     show this help",
  "  --no-config    skip scaffolding paramour.config.ts",
  "  --no-generate  skip the first generate",
  "  --no-script    skip adding the package.json script",
  "  --no-wrap      skip wrapping next.config",
].join("\n");

/**
 * @internal `paramour init` — non-interactive by design: it runs straight
 * through with defaults and prints one status line per step. Exit codes: 0
 * on success INCLUDING manual-fallback wraps (a printed instruction is a
 * successful outcome, not a failure); 2 only on hard errors (no/broken
 * package.json, invalid config file, route collisions).
 */
export async function runInit(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  const { stderr, stdout } = resolveIo(io);
  const parsed = parseCommandFlags(
    argv,
    {
      "dry-run": { default: false, type: "boolean" },
      force: { default: false, type: "boolean" },
      help: { default: false, short: "h", type: "boolean" },
      "no-config": { default: false, type: "boolean" },
      "no-generate": { default: false, type: "boolean" },
      "no-script": { default: false, type: "boolean" },
      "no-wrap": { default: false, type: "boolean" },
    },
    USAGE,
    { stderr, stdout },
  );
  if ("exit" in parsed) return parsed.exit;
  const flags = parsed.values;

  const projectRoot = process.cwd();
  const dry = flags["dry-run"];
  const write = (path: string, content: string): void => {
    if (!dry) writeFileSync(path, content);
  };

  // The one hard prerequisite: init edits package.json and reasons about
  // dependencies, so a project without one has nothing to initialize into.
  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    stderr("paramour: no package.json here — run init at the project root");
    return 2;
  }

  stdout(dry ? "paramour init (dry run — nothing written)" : "paramour init");

  // 1. Scaffold paramour.config.ts.
  if (!flags["no-config"]) {
    const existing = CONFIG_FILE_NAMES.find((name) =>
      existsSync(join(projectRoot, name)),
    );
    if (existing !== undefined && !flags.force) {
      stdout(`  • ${existing} already exists — skipped (--force overwrites)`);
    } else {
      // A .mjs/.json left behind would be shadowed by the scaffold under the
      // ts-first discovery order (§7.2) — --force must truly replace it.
      if (existing !== undefined && existing !== "paramour.config.ts" && !dry) {
        unlinkSync(join(projectRoot, existing));
      }
      write(join(projectRoot, "paramour.config.ts"), paramourConfigTemplate());
      const suffix =
        existing === undefined
          ? ""
          : existing === "paramour.config.ts"
            ? " (overwrote via --force)"
            : ` (replaced ${existing} via --force)`;
      stdout(
        `  ✔ ${dry ? "would create" : "created"} paramour.config.ts${suffix}`,
      );
    }
  }

  // Read whatever config actually exists on disk (the scaffold is
  // commented-out defaults, so scaffolding never changes these values).
  let config;
  try {
    config = (await loadConfigFile(projectRoot))?.config ?? {};
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }

  // 2. Wrap next.config with withTypedRoutes.
  if (!flags["no-wrap"]) {
    const found = findNextConfig(projectRoot);
    if (found === undefined) {
      stdout("  → no next.config found — create one and wrap it yourself:");
      for (const line of manualSnippet().split("\n")) stdout(`      ${line}`);
    } else {
      const name = basename(found.path);
      let source: string | undefined;
      try {
        source = readFileSync(found.path, "utf8");
      } catch (error) {
        // Same stance as the transform's manual fallback: an unreadable
        // config degrades to the printed snippet, never a crash.
        stdout(
          `  → could not read ${name} (${message(error)}) — apply this yourself:`,
        );
        for (const line of manualSnippet().split("\n")) stdout(`      ${line}`);
      }
      if (source !== undefined) {
        const result = await wrapNextConfigSource(source);
        if (result.status === "already-wrapped") {
          stdout(`  • ${name} already wraps withTypedRoutes — skipped`);
        } else if (result.status === "wrapped") {
          write(found.path, result.code);
          stdout(
            `  ✔ ${dry ? "would wrap" : "wrapped"} ${name} with withTypedRoutes`,
          );
        } else {
          stdout(
            `  → could not transform ${name} safely — apply this yourself:`,
          );
          for (const line of result.snippet.split("\n")) {
            stdout(`      ${line}`);
          }
        }
      }
    }
  }

  // 3. package.json script.
  if (!flags["no-script"]) {
    let result;
    try {
      result = addPackageScript(readFileSync(packageJsonPath, "utf8"));
    } catch (error) {
      stderr(`paramour: package.json: ${message(error)}`);
      return 2;
    }
    if (result.changed) {
      write(packageJsonPath, result.text);
      stdout(
        `  ✔ ${dry ? "would add" : "added"} "paramour" script to package.json`,
      );
    } else {
      stdout(`  • package.json already has a "paramour" script — skipped`);
    }
  }

  // 4. First generate.
  // resolve, not join — an absolute outFile must win, as it does in
  // resolveInputs.
  let artifactPath = resolve(
    projectRoot,
    config.outFile ?? "paramour-env.d.ts",
  );
  if (!flags["no-generate"]) {
    let inputs;
    try {
      inputs = await resolveInputs({}, projectRoot, config);
    } catch (error) {
      if (!(error instanceof NoRouteDirsError)) {
        stderr(`paramour: ${message(error)}`);
        return 2;
      }
      stdout(
        "  ⚠ no route directory yet — skipped generate (run `paramour generate` once app/ or pages/ exists)",
      );
    }
    if (inputs !== undefined) {
      artifactPath = inputs.artifactPath;
      const artifactRel = relative(projectRoot, artifactPath).replaceAll(
        "\\",
        "/",
      );
      try {
        if (dry) {
          const routes = scanRoutes(inputs, inputs.pageExtensions);
          stdout(`  ✔ would write ${artifactRel} (${countRoutes(routes)})`);
        } else {
          const result = generate(inputs);
          stdout(
            result.written
              ? `  ✔ wrote ${artifactRel} (${countRoutes(result)})`
              : `  • ${artifactRel} already up to date (${countRoutes(result)}) — skipped`,
          );
        }
      } catch (error) {
        stderr(`paramour: ${message(error)}`);
        return 2;
      }
    }
  }

  return finishWithSummary(projectRoot, artifactPath, stdout);
}

function countRoutes(routes: {
  appRoutes: string[];
  pagesRoutes: string[];
}): string {
  const total = routes.appRoutes.length + routes.pagesRoutes.length;
  return `${String(total)} route${total === 1 ? "" : "s"}`;
}

function finishWithSummary(
  projectRoot: string,
  artifactPath: string,
  stdout: (line: string) => void,
): number {
  // Detect-and-verify summary (warn-level — never affects the exit code).
  stdout("");
  stdout("setup:");
  for (const check of checkSetup(projectRoot, artifactPath)) {
    stdout(`  ${check.ok ? "✔" : "⚠"} ${check.label}`);
    if (check.detail !== undefined) stdout(`      ${check.detail}`);
  }
  stdout("");
  stdout(
    "Commit the generated artifact — `paramour check` verifies it stays current in CI.",
  );
  return 0;
}
