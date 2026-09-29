import { statSync } from "node:fs";
import { resolve } from "node:path";
import { ParamourError } from "paramour";

import { loadConfigFile, type ParamourConfig } from "./config.js";
import { type GenerateInputs } from "./generate.js";
import { DEFAULT_PAGE_EXTENSIONS } from "./scan-app.js";
import { resolveRouteDirs } from "./scan.js";

/**
 * The shared route-dir/artifact flags — every command that scans
 * (`generate`, `check`, `list`) parses these and resolves them here.
 */
export interface InputFlags {
  "app-dir"?: string | undefined;
  "out-file"?: string | undefined;
  "page-extensions"?: string | undefined;
  "pages-dir"?: string | undefined;
}

/**
 * The no-route-dirs case as a distinct class: `generate`/`check`/`list`
 * treat it like any other exit-2 error, but `init` downgrades it to a
 * warn-and-skip — a fresh project legitimately has no app/ or pages/ yet.
 */
export class NoRouteDirsError extends ParamourError {
  override readonly name = "NoRouteDirsError" as const;
}

/**
 * Precedence lives in exactly this function: flags → config file → joint
 * discovery. Paths resolve against the project root (= cwd, where `next`
 * itself would run). Discovery only runs for dirs not explicitly given —
 * passing both bypasses it (and its populated-ignored-dir config error)
 * entirely, which is the documented escape hatch. Only when NEITHER dir
 * exists is that an error: app-only and pages-only projects are both fine.
 *
 * Commands that already loaded the config file (for fields beyond these,
 * e.g. `list`'s routeFiles) pass it as `preloaded` so jiti runs once. The
 * `withTypedRoutes` wrapper resolves through here too, with no flags, so
 * the CLI and `next dev`/`next build` always agree on dirs and artifact.
 */
export async function resolveInputs(
  flags: InputFlags,
  projectRoot: string,
  preloaded?: ParamourConfig,
  pageExtensionsOverride?: readonly string[],
): Promise<GenerateInputs> {
  const file = preloaded ?? (await loadConfigFile(projectRoot))?.config;
  // The override is withTypedRoutes' Next-authoritative extension list:
  // inside `next dev`/`next build`, what Next routes on wins over the file.
  const pageExtensions =
    pageExtensionsOverride ??
    parsePageExtensions(flags["page-extensions"]) ??
    file?.pageExtensions ??
    DEFAULT_PAGE_EXTENSIONS;
  const explicitAppDir = flags["app-dir"] ?? file?.appDir;
  const explicitPagesDir = flags["pages-dir"] ?? file?.pagesDir;
  let appDir =
    explicitAppDir === undefined
      ? undefined
      : checkedDir(explicitAppDir, "app", projectRoot);
  let pagesDir =
    explicitPagesDir === undefined
      ? undefined
      : checkedDir(explicitPagesDir, "pages", projectRoot);
  if (explicitAppDir === undefined || explicitPagesDir === undefined) {
    const discovered = resolveRouteDirs(projectRoot, pageExtensions);
    appDir ??= discovered.appDir;
    pagesDir ??= discovered.pagesDir;
  }
  if (appDir === undefined && pagesDir === undefined) {
    throw new NoRouteDirsError(
      `no route directory (app/, pages/, src/app/, or src/pages/) under ${projectRoot}; pass --app-dir/--pages-dir or set appDir/pagesDir in paramour.config`,
    );
  }
  return {
    appDir,
    artifactPath: resolve(
      projectRoot,
      flags["out-file"] ?? file?.outFile ?? "paramour-env.d.ts",
    ),
    pageExtensions,
    pagesDir,
  };
}

/** Resolve an explicitly-given dir and require that it exists. */
function checkedDir(
  dir: string,
  router: "app" | "pages",
  projectRoot: string,
): string {
  const resolved = resolve(projectRoot, dir);
  if (!statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${router} directory not found: ${resolved}`);
  }
  return resolved;
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
