import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  assertNoStructuralCollisions,
  RouteCollisionError,
} from "./collisions.js";
import { DEFAULT_PAGE_EXTENSIONS } from "./scan-app.js";

/**
 * Pages Router scanner (PR4). Deliberately a separate walker from
 * `scan-app.ts` — the rule sets barely overlap (routes live on FILES here,
 * and none of TR2's skip rules apply), and a shared walker would have to
 * take its rule set as a parameter to be worth having (PR8).
 */

/**
 * Names special to Next at the TOP level of the pages dir only (PR4):
 * `_app`/`_document`/`_error` are framework files, `404`/`500` are error
 * pages, not navigation targets — `href("/404")` should not type-check.
 * Nested twins (`pages/blog/404.tsx`) are ordinary pages and route.
 * Every other `_`-prefixed file routes too (spike 1: co-location under
 * `pages/` was requested, vercel/next.js#8454, and never implemented).
 */
const TOP_LEVEL_EXCLUDED = new Set([
  "404",
  "500",
  "_app",
  "_document",
  "_error",
]);

/**
 * Walk a pages dir and return the sorted union of URL-shaped route paths —
 * exactly the strings `definePagesRoute` accepts (PR4). A route is any file
 * whose extension is in `pageExtensions`, mapped by its path relative to the
 * dir; `index.<ext>` maps to its directory. Two files resolving to one URL
 * path — folder/file spelling (`blog.tsx` + `blog/index.tsx`) or extension
 * twins (`about.tsx` + `about.jsx`) — throw a {@link RouteCollisionError},
 * never dedupe: both are Next's own build errors (PR9).
 */
export function scanPagesRoutes(
  pagesDir: string,
  pageExtensions: readonly string[] = DEFAULT_PAGE_EXTENSIONS,
): string[] {
  // Path → the fs path (relative to pagesDir) that produced it, so a
  // collision can name both files.
  const out = new Map<string, string>();
  walk(pagesDir, [], pageExtensions, out, true);
  // Code-unit sort, never localeCompare — locale independence feeds TR3's
  // byte-identical-on-every-OS guarantee.
  const paths = [...out.keys()].sort();
  // PR9 structural collisions (different slug names, optional-catch-all
  // specificity) — non-equal strings the Map above cannot catch.
  assertNoStructuralCollisions(
    paths.map((path) => ({ path, router: "pages" })),
  );
  return paths;
}

/**
 * The extension a file name matches, or `undefined` — first match in the
 * caller's order, mirroring how Next builds its page matcher from
 * `pageExtensions`. Requires a non-empty base name so a bare `.tsx` file is
 * not a route to `/`.
 */
function matchExtension(
  name: string,
  pageExtensions: readonly string[],
): string | undefined {
  return pageExtensions.find(
    (ext) => name.length > ext.length + 1 && name.endsWith(`.${ext}`),
  );
}

function walk(
  dir: string,
  urlSegments: readonly string[],
  pageExtensions: readonly string[],
  out: Map<string, string>,
  isTopLevel: boolean,
): void {
  // Sorted traversal: readdir order is platform-dependent, and which of two
  // colliding files gets named first in the error must not be.
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const name = entry.name;
    if (entry.isFile()) {
      // Declaration files match `.ts` but are never pages (PR11 §1).
      if (name.endsWith(".d.ts")) continue;
      const ext = matchExtension(name, pageExtensions);
      if (ext === undefined) continue;
      const base = name.slice(0, -(ext.length + 1));
      if (isTopLevel && TOP_LEVEL_EXCLUDED.has(base)) continue;
      // `index.<ext>` maps to its directory; everything else — dynamic
      // segments included — is a path segment of its own (PR4).
      const segments = base === "index" ? urlSegments : [...urlSegments, base];
      const path = segments.length === 0 ? "/" : `/${segments.join("/")}`;
      const file = [...urlSegments, name].join("/");
      const existing = out.get(path);
      if (existing !== undefined) {
        throw new RouteCollisionError(
          `pages route collision at "${path}": ${existing} and ${file} resolve to the same path (PR9)`,
        );
      }
      out.set(path, file);
      continue;
    }
    // Symlinked directories are deliberately not followed (TR2 v1 stance,
    // shared posture).
    if (!entry.isDirectory()) continue;
    // `pages/api/**` is excluded — top level only, so `pages/foo/api/bar.tsx`
    // routes (API-route typing is deferred to v1.x, PR4/§14). NO app-style
    // skip rules beyond this: `(group)`, `@slot`, `(.)x`, and `_`-prefixed
    // dirs are ordinary literal segments in the Pages Router (PR4).
    if (isTopLevel && name === "api") continue;
    walk(join(dir, name), [...urlSegments, name], pageExtensions, out, false);
  }
}
