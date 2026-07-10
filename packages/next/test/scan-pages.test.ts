import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RouteCollisionError, scanPagesRoutes } from "../src";
import { makeTempDir, makeTree } from "./helpers.js";

/**
 * PR4's fixture matrix (PR11 §1) — one fixture per scanner rule. The trees
 * are built programmatically for the same reason as scan-app.test.ts.
 */

/** Build a tree in a temp dir and scan it in one step. */
function scanTree(
  entries: readonly string[],
  pageExtensions?: readonly string[],
): string[] {
  const root = makeTempDir();
  makeTree(root, entries);
  return pageExtensions === undefined
    ? scanPagesRoutes(root)
    : scanPagesRoutes(root, pageExtensions);
}

describe("scanPagesRoutes: file-based discovery (PR4)", () => {
  it("maps index.tsx to '/' and nested index to its directory", () => {
    expect(scanTree(["index.tsx", "blog/index.tsx"])).toEqual(["/", "/blog"]);
  });

  it("maps a plain file to a path segment", () => {
    expect(scanTree(["about.tsx"])).toEqual(["/about"]);
  });

  it("detects every default page extension", () => {
    expect(scanTree(["a.tsx", "b.ts", "c.jsx", "d.js"])).toEqual([
      "/a",
      "/b",
      "/c",
      "/d",
    ]);
  });

  it("honors custom pageExtensions exclusively", () => {
    expect(scanTree(["x.mdx", "y.tsx"], ["mdx"])).toEqual(["/x"]);
  });

  it("ignores .d.ts files and non-matching extensions", () => {
    expect(scanTree(["routes.d.ts", "readme.md", "styles.css"])).toEqual([]);
  });

  it("strips only the final matching extension (foo.test.tsx routes as /foo.test)", () => {
    expect(scanTree(["foo.test.tsx"])).toEqual(["/foo.test"]);
  });

  it("does not treat a bare .tsx file as a page", () => {
    expect(scanTree([".tsx"])).toEqual([]);
  });

  it("does not treat a directory with a page extension as a page", () => {
    expect(scanTree(["about.tsx/"])).toEqual([]);
  });

  it("sorts by code unit, not locale ('/Z' < '/a' < '/é')", () => {
    expect(scanTree(["a.tsx", "Z.tsx", "é.tsx"])).toEqual(["/Z", "/a", "/é"]);
  });
});

describe("scanPagesRoutes: dynamic segments on files and folders (PR4)", () => {
  it("preserves [id] as a file", () => {
    expect(scanTree(["product/[id].tsx"])).toEqual(["/product/[id]"]);
  });

  it("preserves [...slug] as a file", () => {
    expect(scanTree(["shop/[...slug].tsx"])).toEqual(["/shop/[...slug]"]);
  });

  it("preserves [[...slug]] as a file", () => {
    expect(scanTree(["docs/[[...slug]].tsx"])).toEqual(["/docs/[[...slug]]"]);
  });

  it("agrees between folder and file spellings ([id]/index.tsx = [id].tsx)", () => {
    expect(scanTree(["product/[id]/index.tsx"])).toEqual(["/product/[id]"]);
  });

  it("preserves a dynamic folder above a static file", () => {
    expect(scanTree(["[id]/edit.tsx"])).toEqual(["/[id]/edit"]);
  });
});

describe("scanPagesRoutes: top-level-only exclusions (PR4)", () => {
  it("excludes pages/api/** entirely", () => {
    expect(scanTree(["api/users.ts", "api/deep/nested.ts"])).toEqual([]);
  });

  it("does NOT exclude a nested api directory (pages/foo/api/bar.tsx routes)", () => {
    expect(scanTree(["foo/api/bar.tsx"])).toEqual(["/foo/api/bar"]);
  });

  it("excludes _app, _document, _error, 404, 500 at the top level", () => {
    expect(
      scanTree([
        "_app.tsx",
        "_document.tsx",
        "_error.tsx",
        "404.tsx",
        "500.tsx",
      ]),
    ).toEqual([]);
  });

  it("routes nested 404/500 as ordinary pages (pages/blog/404.tsx → /blog/404)", () => {
    expect(scanTree(["blog/404.tsx", "blog/500.tsx"])).toEqual([
      "/blog/404",
      "/blog/500",
    ]);
  });

  it("routes other top-level _-prefixed files (spike 1: only the three names are special)", () => {
    expect(scanTree(["_foo.tsx"])).toEqual(["/_foo"]);
  });

  it("routes nested _-prefixed files and folders (spike 1)", () => {
    expect(scanTree(["_lib/bar.tsx", "blog/_draft.tsx"])).toEqual([
      "/_lib/bar",
      "/blog/_draft",
    ]);
  });

  it("excludes the special names by base name across every page extension", () => {
    expect(scanTree(["_app.jsx", "404.js"])).toEqual([]);
  });
});

describe("scanPagesRoutes: app-only conventions are literal here (PR4)", () => {
  it("treats (group) as a literal segment, not stripped", () => {
    expect(scanTree(["(marketing)/about.tsx"])).toEqual(["/(marketing)/about"]);
  });

  it("treats @slot as a literal segment, not skipped", () => {
    expect(scanTree(["@modal/photo.tsx"])).toEqual(["/@modal/photo"]);
  });

  it("treats (.)x interception spellings as literal segments", () => {
    expect(scanTree(["feed/(.)photo/index.tsx"])).toEqual(["/feed/(.)photo"]);
  });
});

describe("scanPagesRoutes: collisions are errors, never deduped (PR4/PR9)", () => {
  it("errors on folder/file spelling twins (blog.tsx + blog/index.tsx)", () => {
    expect(() => scanTree(["blog.tsx", "blog/index.tsx"])).toThrow(
      RouteCollisionError,
    );
    // Sorted traversal recurses into blog/ before reading blog.tsx, so the
    // folder spelling is named first — deterministically, on every OS.
    expect(() => scanTree(["blog.tsx", "blog/index.tsx"])).toThrow(
      /"\/blog".*blog\/index\.tsx.*blog\.tsx/,
    );
  });

  it("errors on extension twins (about.tsx + about.jsx)", () => {
    expect(() => scanTree(["about.tsx", "about.jsx"])).toThrow(
      RouteCollisionError,
    );
  });

  it("errors on different slug names at one level, file spelling (PR9 structural)", () => {
    expect(() => scanTree(["[id].tsx", "[slug].tsx"])).toThrow(
      RouteCollisionError,
    );
  });

  it("errors on different slug names at one level, folder spelling (PR9 structural)", () => {
    expect(() => scanTree(["x/[id]/index.tsx", "x/[slug]/index.tsx"])).toThrow(
      RouteCollisionError,
    );
  });

  it("errors on optional-catch-all specificity (docs/index.tsx + docs/[[...slug]].tsx)", () => {
    expect(() => scanTree(["docs/index.tsx", "docs/[[...slug]].tsx"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["docs/index.tsx", "docs/[[...slug]].tsx"])).toThrow(
      /same specificity/,
    );
  });

  it("allows the documented priority pattern: [id].tsx beside [...slug].tsx", () => {
    expect(scanTree(["post/[id].tsx", "post/[...slug].tsx"])).toEqual([
      "/post/[...slug]",
      "/post/[id]",
    ]);
  });
});

describe("scanPagesRoutes: error and traversal edges", () => {
  it("throws on a missing pages dir (the caller-side guard is resolveRouteDirs)", () => {
    const missing = join(makeTempDir(), "does-not-exist");
    expect(() => scanPagesRoutes(missing)).toThrow(/ENOENT/);
  });

  it("returns [] for an empty pages dir", () => {
    expect(scanTree([])).toEqual([]);
  });
});
