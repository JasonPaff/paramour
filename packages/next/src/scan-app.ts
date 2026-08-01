import type { Dirent } from "node:fs";

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  assertNoStructuralCollisions,
  RouteCollisionError,
} from "./collisions.js";

/** Next's default `pageExtensions` — extensions only, no leading dot. */
export const DEFAULT_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"] as const;

/**
 * Interception markers `(.)`/`(..)`/`(...)`. A prefix match, so chained
 * forms like `(..)(..)segment` are caught too; tested BEFORE the route-group
 * test so `(.)foo` is never misread as a group.
 */
const INTERCEPTION_PREFIX = /^\(\.{1,3}\)/;

/**
 * Next's documented `%5F` escape (Next "Project Organization" → Private
 * Folders): a folder whose name begins with a percent-encoded underscore
 * serves a URL segment beginning with a literal `_`, opting that segment out
 * of the private-folder convention — `app/%5Fsettings/page.tsx` serves
 * `/_settings`. The escape is defined for the LEADING position only. Because
 * RFC 3986 percent-encoding is case-insensitive on its hex digits (and this
 * could not be pinned against Next's source from here), both `%5F` and `%5f`
 * are decoded defensively (Bug 8). The fs name stays raw for error messages;
 * only the emitted URL segment is decoded.
 */
const LEADING_ESCAPED_UNDERSCORE = /^%5[Ff]/;

/** Route groups `(group)` — stripped from the emitted path. */
const ROUTE_GROUP = /^\(.*\)$/;

/**
 * Whether a directory entry should be treated as a FILE for routing: a real
 * file, or a symlink whose target is a regular file. `Dirent.isFile()` is
 * false for a symlink even when it points at a file, yet Next resolves and
 * serves symlinked `page`/`route` files (common in pnpm-linked monorepos), so
 * dropping them would omit routes that Next actually serves (Bug 4). A
 * symlink to a DIRECTORY returns false — directory symlinks stay not-followed,
 * the existing v1 stance — and a broken link (statSync throws ENOENT) also
 * returns false, i.e. is skipped silently, matching Next's own tolerance of
 * broken links.
 */
export function resolvesToFile(entry: Dirent, dir: string): boolean {
  if (entry.isFile()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    // statSync follows the link (unlike the withFileTypes Dirent, which
    // reflects the link itself).
    return statSync(join(dir, entry.name)).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk an app dir and return the sorted union of URL-shaped route paths —
 * exactly the strings `defineAppRoute` accepts. Pure `fs.readdir` recursion;
 * no dependency on Next internals. Two page files resolving to one URL path
 * — `(a)/x` + `(b)/x` group twins, or `page.tsx` + `page.jsx` extension
 * twins — throw a {@link RouteCollisionError} instead of being deduped, the
 * same stance the pages scanner takes: that state is Next's own build error,
 * and deduping would emit an artifact for a project that cannot build.
 *
 * `route.<ext>` handlers are scanned but never emitted (handler typing is
 * deferred). They exist only to catch the states Next refuses to build: a
 * page and a route handler at the same URL path ("conflicting route and
 * page"), and two route handlers at the same path — both throw.
 */
export function scanAppRoutes(
  appDir: string,
  pageExtensions: readonly string[] = DEFAULT_PAGE_EXTENSIONS,
): string[] {
  // Path → the fs path (relative to appDir) that produced it, so a collision
  // can name both files. `out` holds page routes (emitted); `routeOut` holds
  // route-handler paths (never emitted — collision detection only).
  const out = new Map<string, string>();
  const routeOut = new Map<string, string>();
  const pageFileNames = new Set(pageExtensions.map((ext) => `page.${ext}`));
  const routeFileNames = new Set(pageExtensions.map((ext) => `route.${ext}`));
  walk(appDir, [], [], pageFileNames, routeFileNames, out, routeOut);
  // A page and a route handler resolving to one URL path is Next's
  // "conflicting route and page" build error — no valid artifact exists, so
  // throw rather than emit the page and silently drop the handler. Sorted so
  // the reported pair is deterministic across platforms.
  for (const [path, routeFile] of [...routeOut].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const pageFile = out.get(path);
    if (pageFile !== undefined) {
      throw new RouteCollisionError(
        `app route collision at "${path}": page ${pageFile} and route handler ${routeFile} resolve to the same path, which Next refuses to build (conflicting route and page)`,
      );
    }
  }
  // Code-unit sort, never localeCompare — locale independence feeds the
  // byte-identical-on-every-OS guarantee.
  const paths = [...out.keys()].sort();
  // Structural collisions (different slug names, optional-catch-all
  // specificity) — non-equal strings the Map above cannot catch.
  assertNoStructuralCollisions(paths.map((path) => ({ path, router: "app" })));
  return paths;
}

function walk(
  dir: string,
  urlSegments: readonly string[],
  fsSegments: readonly string[],
  pageFileNames: ReadonlySet<string>,
  routeFileNames: ReadonlySet<string>,
  out: Map<string, string>,
  routeOut: Map<string, string>,
): void {
  // Sorted traversal: readdir order is platform-dependent, and which of two
  // colliding files gets named first in the error must not be.
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const name = entry.name;
    // A real file, or a symlink whose target is a file (Bug 4). Directory
    // symlinks fall through to the directory guard below, which is false for
    // a symlink Dirent, so their subtree is skipped — not followed.
    if (resolvesToFile(entry, dir)) {
      // Exact, case-sensitive `page.<ext>` / `route.<ext>` match. Pages are
      // emitted; route handlers are tracked separately (never emitted —
      // handler typing is deferred) purely to detect the build errors above.
      const isPage = pageFileNames.has(name);
      const isRoute = !isPage && routeFileNames.has(name);
      if (isPage || isRoute) {
        const path =
          urlSegments.length === 0 ? "/" : `/${urlSegments.join("/")}`;
        const file = [...fsSegments, name].join("/");
        const target = isPage ? out : routeOut;
        const existing = target.get(path);
        if (existing !== undefined) {
          throw new RouteCollisionError(
            isPage
              ? `app route collision at "${path}": ${existing} and ${file} resolve to the same path`
              : `app route collision at "${path}": ${existing} and ${file} both declare a route handler at the same path, which Next refuses to build`,
          );
        }
        target.set(path, file);
      }
      continue;
    }
    // Symlinked directories are deliberately not followed (the v1 stance):
    // `resolvesToFile` returned false and `isDirectory()` is false for the
    // link Dirent, so the subtree is skipped here.
    if (!entry.isDirectory()) continue;
    // Skip rules: private folders, parallel slots, interception routes —
    // each skips the entire subtree, pages at any depth included. The `_`
    // test reads the raw fs name, so `%5F`-escaped folders (which do NOT
    // start with `_`) are correctly NOT skipped (Bug 8).
    if (name.startsWith("_")) continue;
    if (name.startsWith("@")) continue;
    if (INTERCEPTION_PREFIX.test(name)) continue;
    if (ROUTE_GROUP.test(name)) {
      // Group stripped: recurse with the SAME url segments.
      walk(
        join(dir, name),
        urlSegments,
        [...fsSegments, name],
        pageFileNames,
        routeFileNames,
        out,
        routeOut,
      );
      continue;
    }
    // Dynamic segments `[id]` / `[...slug]` / `[[...slug]]` pass through
    // verbatim as URL-shaped literals. A leading `%5F` decodes to `_`
    // for the emitted URL segment so it string-matches the served URL; the fs
    // name stays raw for error messages, and the decoded form participates in
    // collision detection via the `out` Map key (Bug 8).
    const urlSegment = name.replace(LEADING_ESCAPED_UNDERSCORE, "_");
    walk(
      join(dir, name),
      [...urlSegments, urlSegment],
      [...fsSegments, name],
      pageFileNames,
      routeFileNames,
      out,
      routeOut,
    );
  }
}
