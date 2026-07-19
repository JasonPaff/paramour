import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RouteCollisionError } from "../src";
import { scanAppRoutes } from "../src/scan-app.js";
import { scanRoutes } from "../src/scan.js";
import { makeTempDir, makeTree } from "./helpers.js";

/**
 * Structural-collision regex behavior (PR9, bug 6): a dynamic segment param
 * may contain a dot (`[file.ext]`), matching core's SINGLE_TOKEN regex
 * (packages/core/src/path.ts). Before the fix the plain alternative excluded
 * `.`, so `[a.b]` was misread as a literal segment and the different-slug-name
 * check silently passed for an unbuildable project.
 */
describe("dot in a dynamic segment param (bug 6)", () => {
  it("flags different slug names when one param contains a dot", () => {
    // Next: "You cannot use different slug names for the same dynamic path".
    const root = makeTempDir();
    makeTree(root, ["app/x/[a.b]/page.tsx", "app/x/[c]/page.tsx"]);
    expect(() => scanRoutes({ appDir: join(root, "app") })).toThrow(
      RouteCollisionError,
    );
  });

  it("catches the cross-router variant on a shared prefix", () => {
    const root = makeTempDir();
    makeTree(root, ["app/x/[a.b]/page.tsx", "pages/x/[c].tsx"]);
    expect(() =>
      scanRoutes({ appDir: join(root, "app"), pagesDir: join(root, "pages") }),
    ).toThrow(RouteCollisionError);
  });

  it("accepts a lone dotted-param route", () => {
    const root = makeTempDir();
    makeTree(root, ["app/x/[a.b]/page.tsx"]);
    expect(scanAppRoutes(join(root, "app"))).toEqual(["/x/[a.b]"]);
  });

  it("classifies a dotted param as plain, so it coexists with a catch-all", () => {
    // plain vs catch-all at one level is Next's priority pattern, not an
    // error; this passing proves `[a.b]` is treated as plain, not catch-all.
    const root = makeTempDir();
    makeTree(root, ["app/x/[a.b]/page.tsx", "app/x/[...rest]/page.tsx"]);
    expect(() => scanAppRoutes(join(root, "app"))).not.toThrow();
  });
});
