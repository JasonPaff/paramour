import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RouteCollisionError, scanAppRoutes } from "../src";
import { makeTempDir, makeTree, trySymlink } from "./helpers.js";

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

  it("does not emit a route.ts handler alone (TR2/§14)", () => {
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

  it("follows a symlinked page FILE — Next serves it (Bug 4)", (ctx) => {
    // A file symlink is followed (statSync resolves the target), unlike a
    // directory symlink above. Common in pnpm-linked monorepos.
    const root = makeTempDir();
    makeTree(root, ["app/aliased/", "target/page.tsx"]);
    if (
      !trySymlink(
        join(root, "target", "page.tsx"),
        join(root, "app", "aliased", "page.tsx"),
        "file",
      )
    ) {
      ctx.skip();
      return;
    }
    expect(scanAppRoutes(join(root, "app"))).toEqual(["/aliased"]);
  });

  it("silently skips a broken page-file symlink (Bug 4)", (ctx) => {
    const root = makeTempDir();
    makeTree(root, ["app/broken/"]);
    if (
      !trySymlink(
        join(root, "does-not-exist", "page.tsx"),
        join(root, "app", "broken", "page.tsx"),
        "file",
      )
    ) {
      ctx.skip();
      return;
    }
    expect(scanAppRoutes(join(root, "app"))).toEqual([]);
  });
});

describe("scanAppRoutes: page/route-handler conflicts (PR9, Bug 5)", () => {
  it("throws when a page and a route handler share a directory", () => {
    expect(() => scanTree(["api/page.tsx", "api/route.ts"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["api/page.tsx", "api/route.ts"])).toThrow(
      /"\/api": page api\/page\.tsx and route handler api\/route\.ts/,
    );
  });

  it("throws when a page and a route handler collide across route groups", () => {
    expect(() => scanTree(["(a)/x/page.tsx", "(b)/x/route.ts"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["(a)/x/page.tsx", "(b)/x/route.ts"])).toThrow(
      /"\/x": page/,
    );
  });

  it("throws when two route handlers collide across route groups", () => {
    // Next also refuses (a)/x/route.ts + (b)/x/route.ts; consistent with the
    // PR9 invariant even though no page is involved.
    expect(() => scanTree(["(a)/x/route.ts", "(b)/x/route.ts"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["(a)/x/route.ts", "(b)/x/route.ts"])).toThrow(
      /route handler/,
    );
  });

  it("emits nothing for route handlers across every extension", () => {
    expect(
      scanTree(["a/route.ts", "b/route.js", "c/route.tsx", "d/route.jsx"]),
    ).toEqual([]);
  });

  it("emits the page and ignores a route handler at a DIFFERENT path", () => {
    expect(scanTree(["dash/page.tsx", "api/route.ts"])).toEqual(["/dash"]);
  });
});

describe("scanAppRoutes: %5F escaped-underscore folders (Bug 8, TR2)", () => {
  it("decodes a leading %5F folder to a /_name segment", () => {
    expect(scanTree(["%5Fsettings/page.tsx"])).toEqual(["/_settings"]);
  });

  it("decodes a lowercase %5f folder too (both hex cases accepted)", () => {
    expect(scanTree(["%5fsettings/page.tsx"])).toEqual(["/_settings"]);
  });

  it("decodes a nested %5F folder", () => {
    expect(scanTree(["account/%5Fsettings/page.tsx"])).toEqual([
      "/account/_settings",
    ]);
  });

  it("still skips a real _private folder (the skip reads the raw fs name)", () => {
    expect(scanTree(["_settings/page.tsx"])).toEqual([]);
  });

  it("collides on the DECODED /_x key across route groups", () => {
    // (a)/%5Fx + (b)/%5Fx both decode to /_x; the collision message names the
    // decoded path, proving the escaped form drives collision detection (Bug
    // 8). (Distinct fs parents, so this works on case-insensitive filesystems
    // where %5Fx and %5fx would be the same directory.)
    expect(() => scanTree(["(a)/%5Fx/page.tsx", "(b)/%5Fx/page.tsx"])).toThrow(
      RouteCollisionError,
    );
    expect(() => scanTree(["(a)/%5Fx/page.tsx", "(b)/%5Fx/page.tsx"])).toThrow(
      /"\/_x"/,
    );
  });
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
