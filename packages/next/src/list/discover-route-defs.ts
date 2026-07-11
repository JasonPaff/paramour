import type { AnyRoute, RouterKind } from "paramour";

import { readFileSync, statSync } from "node:fs";
import { relative } from "node:path";

import { message } from "../cli-io.js";

/**
 * Route-definition discovery for `paramour list`/`doctor`: find the modules
 * that call defineAppRoute/definePagesRoute, evaluate them, and collect the
 * exported route objects. Generation never runs any of this — route shapes
 * exist only on runtime route objects, so reading them means executing user
 * modules; every failure degrades per-module rather than aborting the scan.
 */

export interface DiscoveryResult {
  /** Deduped by `(router, path)`, in sorted-file order — first export wins. */
  definitions: RouteDefinition[];
  duplicates: DuplicateDefinition[];
  /** Modules that matched the scan but threw when evaluated. */
  loadFailures: LoadFailure[];
}

/** A later definition of a `(router, path)` already seen; first wins. */
export interface DuplicateDefinition {
  file: string;
  firstFile: string;
  path: string;
  router: RouterKind;
}

export interface LoadFailure {
  file: string;
  message: string;
}

/** One discovered route object and where it came from. */
export interface RouteDefinition {
  exportName: string;
  /** Project-root-relative, `/`-separated — stable across platforms. */
  file: string;
  route: AnyRoute;
}

// No .jsx/.tsx: jiti does not transform JSX, so a matched component file
// could never evaluate — it would only add load-failure noise (a page
// merely MENTIONING defineAppRoute in prose already trips the content
// pre-filter). Definitions living in JSX files need `routeFiles` globs.
const DEFAULT_PATTERNS = ["**/*.{js,mjs,mts,ts}"];

const IGNORE_PATTERNS = [
  "**/.git/**",
  "**/.next/**",
  "**/build/**",
  "**/coverage/**",
  "**/dist/**",
  "**/node_modules/**",
  "**/out/**",
];

/** Files past this size skip the content pre-filter (bundles, lockfiles). */
const MAX_PREFILTER_BYTES = 512 * 1024;

/**
 * Discovery = glob → content pre-filter → evaluate. The default glob is
 * every source file outside the usual output dirs; a file is loaded only if
 * its text mentions a define constructor (grep-then-load). `routeFiles`
 * config globs replace the default patterns when the heuristic misfires.
 *
 * jiti evaluates matched files (the §7.2 loader carry-over). Known limits,
 * both handled by the per-module degrade: tsconfig `paths` aliases are not
 * resolved (a future improvement could feed them into jiti's `alias`
 * option), and `server-only`-style imports throw outside Next.
 */
export async function discoverRouteDefinitions(
  projectRoot: string,
  options: { routeFiles?: readonly string[] | undefined } = {},
): Promise<DiscoveryResult> {
  // Dynamic imports, same stance as config.ts: only commands that actually
  // discover definitions pay for tinyglobby/jiti.
  const { glob } = await import("tinyglobby");
  const files = await glob(
    options.routeFiles === undefined
      ? DEFAULT_PATTERNS
      : [...options.routeFiles],
    { absolute: true, cwd: projectRoot, ignore: IGNORE_PATTERNS },
  );
  // Deterministic load order — dedupe's "first wins" must not depend on
  // filesystem enumeration order.
  files.sort();
  const candidates = files.filter(mentionsDefineCall);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    interopDefault: true,
  });
  const definitions: RouteDefinition[] = [];
  const duplicates: DuplicateDefinition[] = [];
  const loadFailures: LoadFailure[] = [];
  const seen = new Map<string, RouteDefinition>();
  for (const file of candidates) {
    const relFile = relative(projectRoot, file).replaceAll("\\", "/");
    let mod: unknown;
    try {
      mod = await jiti.import(file);
    } catch (error) {
      loadFailures.push({ file: relFile, message: message(error) });
      continue;
    }
    if (typeof mod !== "object" || mod === null) continue;
    for (const [exportName, value] of Object.entries(mod)) {
      if (!isRouteLike(value)) continue;
      const key = routeKey(value["~router"], value.path);
      const first = seen.get(key);
      if (first !== undefined) {
        duplicates.push({
          file: relFile,
          firstFile: first.file,
          path: value.path,
          router: value["~router"],
        });
        continue;
      }
      const definition: RouteDefinition = {
        exportName,
        file: relFile,
        route: value,
      };
      seen.set(key, definition);
      definitions.push(definition);
    }
  }
  return { definitions, duplicates, loadFailures };
}

/**
 * The `(router, path)` identity key — discovery's dedupe, `list`'s
 * definition overlay, and doctor's coverage count all build lookups with it.
 */
export function routeKey(router: RouterKind, path: string): string {
  return `${router}\0${path}`;
}

/**
 * Structural, not `instanceof` or brand-equality: the user's route objects
 * come from THEIR `paramour` instance — a different module realm than the
 * CLI's own dependency.
 */
function isRouteLike(value: unknown): value is AnyRoute {
  if (typeof value !== "object" || value === null) return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route.path === "string" &&
    (route["~router"] === "app" || route["~router"] === "pages") &&
    typeof route["~params"] === "object" &&
    route["~params"] !== null &&
    Array.isArray(route["~segments"])
  );
}

function mentionsDefineCall(file: string): boolean {
  try {
    const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
    if (size > MAX_PREFILTER_BYTES) return false;
    const text = readFileSync(file, "utf8");
    return text.includes("defineAppRoute") || text.includes("definePagesRoute");
  } catch {
    return false;
  }
}
