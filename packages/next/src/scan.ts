import { statSync } from "node:fs";
import { join } from "node:path";

import {
  assertNoStructuralCollisions,
  RouteCollisionError,
} from "./collisions.js";
import { DEFAULT_PAGE_EXTENSIONS, scanAppRoutes } from "./scan-app.js";
import { scanPagesRoutes } from "./scan-pages.js";

/**
 * The thin orchestrator over the two scanners (PR8): joint directory
 * discovery, delegation, and the cross-router collision checks (PR9).
 */

/** The two route dirs of a project; either may be absent (PR1 hybrid). */
export interface RouteDirs {
  appDir?: string | undefined;
  pagesDir?: string | undefined;
}

/** Result of {@link scanRoutes} — the input shape of the PR9 artifact. */
export interface ScanRoutesResult {
  appRoutes: string[];
  pagesRoutes: string[];
}

/**
 * Joint route-dir discovery (spike-2 ruling). Next's documented rule is one
 * decision, not two probes: `src/app` AND `src/pages` are both ignored
 * whenever `app/` OR `pages/` exists at the project root. An ignored src dir
 * that contains page files is a hard config error — Next silently serves
 * none of those pages (and has shipped bugs in the mixed case,
 * vercel/next.js#58728), so there is no valid state to warn about.
 */
export function resolveRouteDirs(
  projectRoot: string,
  pageExtensions: readonly string[] = DEFAULT_PAGE_EXTENSIONS,
): RouteDirs {
  const rootApp = dirIfExists(join(projectRoot, "app"));
  const rootPages = dirIfExists(join(projectRoot, "pages"));
  const srcApp = dirIfExists(join(projectRoot, "src", "app"));
  const srcPages = dirIfExists(join(projectRoot, "src", "pages"));
  if (rootApp === undefined && rootPages === undefined) {
    return { appDir: srcApp, pagesDir: srcPages };
  }
  const winner = rootApp === undefined ? "pages/" : "app/";
  const probes: [string | undefined, (dir: string) => string[], string][] = [
    [srcApp, (dir) => scanAppRoutes(dir, pageExtensions), "src/app"],
    [srcPages, (dir) => scanPagesRoutes(dir, pageExtensions), "src/pages"],
  ];
  for (const [dir, scan, label] of probes) {
    if (dir === undefined) continue;
    let populated: boolean;
    try {
      populated = scan(dir).length > 0;
    } catch {
      // A collision inside the ignored dir still proves it has page files —
      // which is the only fact the probe needs.
      populated = true;
    }
    if (populated) {
      throw new Error(
        `${label} contains page files, but Next ignores src/ route directories whenever app/ or pages/ exists at the project root (here: ${winner}) — those pages are silently unreachable. Move ${label} to the project root, or the root ${winner} directory under src/; explicit --app-dir/--pages-dir flags bypass this discovery.`,
      );
    }
  }
  return { appDir: rootApp, pagesDir: rootPages };
}

/**
 * Scan whichever route dirs exist and return both route unions (PR1). After
 * each scanner's own intra-router checks, two cross-router passes run (PR9):
 * a path in BOTH unions is Next's "Conflicting app and page file" build
 * error, and the structural pass re-runs over the merged, labeled union so
 * shared-prefix slug conflicts and cross-router optional-catch-all
 * specificity are caught too.
 */
export function scanRoutes(
  dirs: RouteDirs,
  pageExtensions: readonly string[] = DEFAULT_PAGE_EXTENSIONS,
): ScanRoutesResult {
  const appRoutes =
    dirs.appDir === undefined ? [] : scanAppRoutes(dirs.appDir, pageExtensions);
  const pagesRoutes =
    dirs.pagesDir === undefined
      ? []
      : scanPagesRoutes(dirs.pagesDir, pageExtensions);
  const appSet = new Set(appRoutes);
  const shared = pagesRoutes.filter((path) => appSet.has(path));
  if (shared.length > 0) {
    throw new RouteCollisionError(
      `route collision between app/ and pages/: ${shared.map((path) => `"${path}"`).join(", ")} — Next fails the build on conflicting app and page files (PR9)`,
    );
  }
  assertNoStructuralCollisions([
    ...appRoutes.map((path) => ({ path, router: "app" as const })),
    ...pagesRoutes.map((path) => ({ path, router: "pages" as const })),
  ]);
  return { appRoutes, pagesRoutes };
}

function dirIfExists(path: string): string | undefined {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory()
    ? path
    : undefined;
}
