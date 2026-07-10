import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveAppDir, scanAppRoutes } from "../src";
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

  it("dedupes group collisions to one path", () => {
    expect(scanTree(["(a)/x/page.tsx", "(b)/x/page.tsx"])).toEqual(["/x"]);
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

describe("resolveAppDir (TR2)", () => {
  it("prefers app/ when both exist", () => {
    const root = makeTempDir();
    makeTree(root, ["app/", "src/app/"]);
    expect(resolveAppDir(root)).toBe(join(root, "app"));
  });

  it("falls back to src/app/", () => {
    const root = makeTempDir();
    makeTree(root, ["src/app/"]);
    expect(resolveAppDir(root)).toBe(join(root, "src", "app"));
  });

  it("returns undefined when neither exists", () => {
    expect(resolveAppDir(makeTempDir())).toBeUndefined();
  });

  it("ignores a plain file named app", () => {
    const root = makeTempDir();
    makeTree(root, ["app"]);
    expect(resolveAppDir(root)).toBeUndefined();
  });
});
