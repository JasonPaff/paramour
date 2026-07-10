import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RouteCollisionError, scanAppRoutes } from "../src";
import { makeTempDir, makeTree } from "./helpers.js";

/** Build a tree in a temp dir and scan it in one step. */
function scanTree(
  entries: readonly string[],
  pageExtensions?: readonly string[],
): string[] {
  const root = makeTempDir();
  makeTree(root, entries);
  return pageExtensions === undefined
    ? scanAppRoutes(root)
    : scanAppRoutes(root, pageExtensions);
}

describe("scanAppRoutes: page detection (TR2)", () => {
  it("emits '/' for a root page", () => {
    expect(scanTree(["page.tsx"])).toEqual(["/"]);
  });

  it("emits nested static pages, sorted, without trailing slashes", () => {
    expect(scanTree(["blog/page.tsx", "about/page.tsx"])).toEqual([
      "/about",
      "/blog",
    ]);
  });

  it("detects every default page extension", () => {
    expect(
      scanTree(["a/page.tsx", "b/page.ts", "c/page.jsx", "d/page.js"]),
    ).toEqual(["/a", "/b", "/c", "/d"]);
  });

  it("ignores files that are not exactly page.<ext>", () => {
    expect(
      scanTree([
        "x/layout.tsx",
        "x/pages.tsx",
        "x/page.test.tsx",
        "x/page.tsx.bak",
      ]),
    ).toEqual([]);
  });

  it("matches page.<ext> case-sensitively", () => {
    expect(scanTree(["x/Page.tsx"])).toEqual([]);
  });

  it("honors custom pageExtensions exclusively", () => {
    expect(scanTree(["x/page.mdx", "y/page.tsx"], ["mdx"])).toEqual(["/x"]);
  });

  it("ignores route.ts handlers (TR2)", () => {
    expect(scanTree(["api/route.ts"])).toEqual([]);
  });

  it("does not treat a directory named page.tsx as a page", () => {
    expect(scanTree(["x/page.tsx/"])).toEqual([]);
  });

  it("emits both a page dir and its child page", () => {
    expect(scanTree(["blog/page.tsx", "blog/[slug]/page.tsx"])).toEqual([
      "/blog",
      "/blog/[slug]",
    ]);
  });
});

describe("scanAppRoutes: dynamic segments verbatim (TR2/RL2)", () => {
  it("preserves [id]", () => {
    expect(scanTree(["product/[id]/page.tsx"])).toEqual(["/product/[id]"]);
  });

  it("preserves [...slug]", () => {
    expect(scanTree(["docs/[...slug]/page.tsx"])).toEqual(["/docs/[...slug]"]);
  });

  it("preserves [[...slug]]", () => {
    expect(scanTree(["docs/[[...slug]]/page.tsx"])).toEqual([
      "/docs/[[...slug]]",
    ]);
  });
});

describe("scanAppRoutes: route groups (TR2)", () => {
  it("strips (group) from the emitted path", () => {
    expect(scanTree(["(marketing)/about/page.tsx"])).toEqual(["/about"]);
  });

  it("emits '/' for a group page collapsing to root", () => {
    expect(scanTree(["(marketing)/page.tsx"])).toEqual(["/"]);
  });

  it("strips nested groups", () => {
    expect(scanTree(["(a)/(b)/x/page.tsx"])).toEqual(["/x"]);
  });

  it("errors on a group collision instead of deduping (PR4/PR9 alignment)", () => {
    // (a)/x + (b)/x is Next's own build error; the old Set-dedupe silently
    // masked exactly the state Next refuses to build.
    expect(() => scanTree(["(a)/x/page.tsx", "(b)/x/page.tsx"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["(a)/x/page.tsx", "(b)/x/page.tsx"])).toThrow(
      /"\/x".*\(a\)\/x\/page\.tsx.*\(b\)\/x\/page\.tsx/,
    );
  });

  it("errors on extension twins in one directory (page.tsx + page.jsx)", () => {
    expect(() => scanTree(["x/page.tsx", "x/page.jsx"])).toThrow(
      RouteCollisionError,
    );
  });
});

describe("scanAppRoutes: structural collisions (PR9)", () => {
  it("errors on different slug names at one level", () => {
    expect(() => scanTree(["x/[id]/page.tsx", "x/[slug]/page.tsx"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["x/[id]/page.tsx", "x/[slug]/page.tsx"])).toThrow(
      /\[id\].*\[slug\]|\[slug\].*\[id\]/,
    );
  });

  it("errors on different slug names at the root level", () => {
    expect(() => scanTree(["[id]/page.tsx", "[slug]/page.tsx"])).toThrow(
      RouteCollisionError,
    );
  });

  it("catches a slug-name conflict buried below different subtrees", () => {
    // The colliding position is x/*; the pages live deeper. Next still
    // refuses to build [id] beside [slug] regardless of where pages sit.
    expect(() =>
      scanTree(["x/[id]/page.tsx", "x/[slug]/edit/page.tsx"]),
    ).toThrow(RouteCollisionError);
  });

  it("allows the documented priority pattern: [id] beside [...slug]", () => {
    // Predefined > dynamic > catch-all is Next's own resolution order, not
    // a collision — the kind split in the detector exists for this case.
    expect(scanTree(["post/[id]/page.tsx", "post/[...slug]/page.tsx"])).toEqual(
      ["/post/[...slug]", "/post/[id]"],
    );
  });

  it("allows the same slug name under different parents", () => {
    expect(scanTree(["a/[id]/page.tsx", "b/[slug]/page.tsx"])).toEqual([
      "/a/[id]",
      "/b/[slug]",
    ]);
  });

  it("errors on required beside optional catch-all at one level", () => {
    expect(() =>
      scanTree(["docs/[...slug]/page.tsx", "docs/[[...slug]]/page.tsx"]),
    ).toThrow(RouteCollisionError);
  });

  it("errors on an optional catch-all beside its own base path", () => {
    expect(() =>
      scanTree(["docs/page.tsx", "docs/[[...slug]]/page.tsx"]),
    ).toThrow(RouteCollisionError);
    expect(() =>
      scanTree(["docs/page.tsx", "docs/[[...slug]]/page.tsx"]),
    ).toThrow(/same specificity/);
  });

  it("errors on a root optional catch-all beside a root page", () => {
    expect(() => scanTree(["page.tsx", "[[...slug]]/page.tsx"])).toThrow(
      RouteCollisionError,
    );
  });

  it("allows an optional catch-all whose base path has no page", () => {
    expect(scanTree(["docs/[[...slug]]/page.tsx"])).toEqual([
      "/docs/[[...slug]]",
    ]);
  });
});

describe("scanAppRoutes: skipped subtrees (TR2)", () => {
  it("skips @slot subtrees entirely, pages at any depth included", () => {
    expect(scanTree(["@modal/page.tsx", "@modal/deep/page.tsx"])).toEqual([]);
  });

  it("skips interception subtrees for every marker form", () => {
    expect(
      scanTree([
        "feed/(.)photo/page.tsx",
        "feed/(..)photo/page.tsx",
        "feed/(...)photo/page.tsx",
        "feed/(..)(..)photo/page.tsx",
      ]),
    ).toEqual([]);
  });

  it("still emits the parent of an interception subtree", () => {
    expect(scanTree(["feed/page.tsx", "feed/(.)photo/page.tsx"])).toEqual([
      "/feed",
    ]);
  });

  it("skips _private subtrees entirely, pages at any depth included", () => {
    expect(scanTree(["_lib/page.tsx", "_lib/deep/page.tsx"])).toEqual([]);
  });
});

describe("scanAppRoutes: error and traversal edges (TR2)", () => {
  it("throws on a missing app dir (the caller-side guard is resolveAppDir)", () => {
    const missing = join(makeTempDir(), "does-not-exist");
    expect(() => scanAppRoutes(missing)).toThrow(/ENOENT/);
  });

  it.skipIf(process.platform === "win32")(
    "does not follow a symlinked directory (TR2 v1 stance)",
    () => {
      const root = makeTempDir();
      makeTree(root, ["app/", "outside/linked/page.tsx"]);
      symlinkSync(join(root, "outside"), join(root, "app", "external"), "dir");
      expect(scanAppRoutes(join(root, "app"))).toEqual([]);
    },
  );
});

/**
 * Pins for the group/interception regex edges: these names' classification is
 * exactly what `^\(.*\)$` (group: stripped) vs `^\(\.{1,3}\)` (interception:
 * skipped) produce today, guarding future regex refactors.
 */
describe("scanAppRoutes: group/interception regex edge pins (TR2)", () => {
  it("(a)(b) matches the group regex and is stripped", () => {
    expect(scanTree(["(a)(b)/x/page.tsx"])).toEqual(["/x"]);
  });

  it("() matches the group regex (empty name) and is stripped", () => {
    expect(scanTree(["()/y/page.tsx"])).toEqual(["/y"]);
  });

  it("(....) is NOT an interception marker (max 3 dots); it strips as a group", () => {
    expect(scanTree(["(....)/z/page.tsx"])).toEqual(["/z"]);
  });

  it("composes group stripping with dynamic segments passed through verbatim", () => {
    expect(
      scanTree(["(shop)/product/[id]/reviews/[[...rest]]/page.tsx"]),
    ).toEqual(["/product/[id]/reviews/[[...rest]]"]);
  });

  it("skip rules below a group still apply: @slot and (.)interception contribute nothing", () => {
    expect(scanTree(["(g)/@slot/page.tsx", "(g)/(.)foo/page.tsx"])).toEqual([]);
  });
});
