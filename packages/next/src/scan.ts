import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
 * The app dir is `app/` or `src/app/`, first that exists under the project
 * root (TR2); `undefined` when neither does. This is the caller-side guard —
 * `scanRoutes` itself lets a missing dir throw.
 */
export function resolveAppDir(projectRoot: string): string | undefined {
  for (const candidate of ["app", join("src", "app")]) {
    const dir = join(projectRoot, candidate);
    if (statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return dir;
  }
  return undefined;
}

/**
 * Walk an app dir and return the sorted, deduped union of URL-shaped route
 * paths — exactly the strings `defineAppRoute` accepts (TR2, RL2). Pure
 * `fs.readdir` recursion; no dependency on Next internals.
 */
export function scanRoutes(
  appDir: string,
  pageExtensions: readonly string[] = DEFAULT_PAGE_EXTENSIONS,
): string[] {
  const out = new Set<string>();
  const pageFileNames = new Set(pageExtensions.map((ext) => `page.${ext}`));
  walk(appDir, [], pageFileNames, out);
  // Code-unit sort, never localeCompare — locale independence feeds TR3's
  // byte-identical-on-every-OS guarantee.
  return [...out].sort();
}

function walk(
  dir: string,
  urlSegments: readonly string[],
  pageFileNames: ReadonlySet<string>,
  out: Set<string>,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      // Exact, case-sensitive `page.<ext>` match (TR2). `route.ts` handlers
      // need no special-casing — they never match (handler typing is §14).
      if (pageFileNames.has(entry.name)) {
        out.add(urlSegments.length === 0 ? "/" : `/${urlSegments.join("/")}`);
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
      // Group stripped: recurse with the SAME segments. `out` being a Set
      // dedupes `(a)/x` + `(b)/x` collisions — Next's own build error (TR2).
      walk(join(dir, name), urlSegments, pageFileNames, out);
      continue;
    }
    // Dynamic segments `[id]` / `[...slug]` / `[[...slug]]` pass through
    // verbatim (TR2, RL2 URL-shaped literals).
    walk(join(dir, name), [...urlSegments, name], pageFileNames, out);
  }
}
