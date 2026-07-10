import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  assertNoStructuralCollisions,
  RouteCollisionError,
} from "./collisions.js";

/** Next's default `pageExtensions` — extensions only, no leading dot (TR2). */
export const DEFAULT_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"] as const;

/**
 * Interception markers `(.)`/`(..)`/`(...)` (TR2, RL2 / §15.5). A prefix
 * match, so chained forms like `(..)(..)segment` are caught too; tested
 * BEFORE the route-group test so `(.)foo` is never misread as a group.
 */
const INTERCEPTION_PREFIX = /^\(\.{1,3}\)/;

/** Route groups `(group)` — stripped from the emitted path (TR2, RL2). */
const ROUTE_GROUP = /^\(.*\)$/;

/**
 * Walk an app dir and return the sorted union of URL-shaped route paths —
 * exactly the strings `defineAppRoute` accepts (TR2, RL2). Pure `fs.readdir`
 * recursion; no dependency on Next internals. Two page files resolving to
 * one URL path — `(a)/x` + `(b)/x` group twins, or `page.tsx` + `page.jsx`
 * extension twins — throw a {@link RouteCollisionError} instead of being
 * deduped (PR4/PR9 alignment ruling): that state is Next's own build error,
 * and deduping would emit an artifact for a project that cannot build.
 */
export function scanAppRoutes(
  appDir: string,
  pageExtensions: readonly string[] = DEFAULT_PAGE_EXTENSIONS,
): string[] {
  // Path → the fs path (relative to appDir) that produced it, so a collision
  // can name both files.
  const out = new Map<string, string>();
  const pageFileNames = new Set(pageExtensions.map((ext) => `page.${ext}`));
  walk(appDir, [], [], pageFileNames, out);
  // Code-unit sort, never localeCompare — locale independence feeds TR3's
  // byte-identical-on-every-OS guarantee.
  const paths = [...out.keys()].sort();
  // PR9 structural collisions (different slug names, optional-catch-all
  // specificity) — non-equal strings the Map above cannot catch.
  assertNoStructuralCollisions(paths.map((path) => ({ path, router: "app" })));
  return paths;
}

function walk(
  dir: string,
  urlSegments: readonly string[],
  fsSegments: readonly string[],
  pageFileNames: ReadonlySet<string>,
  out: Map<string, string>,
): void {
  // Sorted traversal: readdir order is platform-dependent, and which of two
  // colliding files gets named first in the error must not be.
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.isFile()) {
      // Exact, case-sensitive `page.<ext>` match (TR2). `route.ts` handlers
      // need no special-casing — they never match (handler typing is §14).
      if (pageFileNames.has(entry.name)) {
        const path =
          urlSegments.length === 0 ? "/" : `/${urlSegments.join("/")}`;
        const file = [...fsSegments, entry.name].join("/");
        const existing = out.get(path);
        if (existing !== undefined) {
          throw new RouteCollisionError(
            `app route collision at "${path}": ${existing} and ${file} resolve to the same path (PR9)`,
          );
        }
        out.set(path, file);
      }
      continue;
    }
    // Symlinked directories are deliberately not followed (TR2 v1 stance).
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    // TR2 skip rules: private folders, parallel slots, interception routes —
    // each skips the entire subtree, pages at any depth included.
    if (name.startsWith("_")) continue;
    if (name.startsWith("@")) continue;
    if (INTERCEPTION_PREFIX.test(name)) continue;
    if (ROUTE_GROUP.test(name)) {
      // Group stripped: recurse with the SAME url segments (TR2).
      walk(
        join(dir, name),
        urlSegments,
        [...fsSegments, name],
        pageFileNames,
        out,
      );
      continue;
    }
    // Dynamic segments `[id]` / `[...slug]` / `[[...slug]]` pass through
    // verbatim (TR2, RL2 URL-shaped literals).
    walk(
      join(dir, name),
      [...urlSegments, name],
      [...fsSegments, name],
      pageFileNames,
      out,
    );
  }
}
