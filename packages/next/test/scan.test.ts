import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveRouteDirs, RouteCollisionError, scanRoutes } from "../src";
import { makeTempDir, makeTree } from "./helpers.js";

/**
 * Orchestrator suite (PR8/PR9, PR11 §2): joint dir discovery per the
 * spike-2 ruling, hybrid scanning, and the cross-router collision paths.
 */

describe("resolveRouteDirs (spike-2 ruling)", () => {
  it("finds root app/ and pages/ together (PR1 hybrid)", () => {
    const root = makeTempDir();
    makeTree(root, ["app/", "pages/"]);
    expect(resolveRouteDirs(root)).toEqual({
      appDir: join(root, "app"),
      pagesDir: join(root, "pages"),
    });
  });

  it("finds one root dir with the other absent", () => {
    const root = makeTempDir();
    makeTree(root, ["pages/"]);
    expect(resolveRouteDirs(root)).toEqual({
      appDir: undefined,
      pagesDir: join(root, "pages"),
    });
  });

  it("falls back to src/ variants when no root dir exists", () => {
    const root = makeTempDir();
    makeTree(root, ["src/app/", "src/pages/"]);
    expect(resolveRouteDirs(root)).toEqual({
      appDir: join(root, "src", "app"),
      pagesDir: join(root, "src", "pages"),
    });
  });

  it("returns both undefined when no route dir exists at all", () => {
    expect(resolveRouteDirs(makeTempDir())).toEqual({
      appDir: undefined,
      pagesDir: undefined,
    });
  });

  it("ignores a plain file named app or pages", () => {
    const root = makeTempDir();
    makeTree(root, ["app", "pages"]);
    expect(resolveRouteDirs(root)).toEqual({
      appDir: undefined,
      pagesDir: undefined,
    });
  });

  it("a root dir disables src/ variants for BOTH routers (joint rule)", () => {
    // Root app/ exists → src/pages is ignored even though no root pages/
    // exists; an EMPTY ignored dir is fine (nothing is unreachable).
    const root = makeTempDir();
    makeTree(root, ["app/", "src/pages/"]);
    expect(resolveRouteDirs(root)).toEqual({
      appDir: join(root, "app"),
      pagesDir: undefined,
    });
  });

  it("errors on a populated ignored dir: app/ + src/pages with page files", () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx", "src/pages/index.tsx"]);
    expect(() => resolveRouteDirs(root)).toThrow(/silently unreachable/);
    expect(() => resolveRouteDirs(root)).toThrow(/src\/pages/);
  });

  it("errors on the mirror case: pages/ + src/app with page files", () => {
    const root = makeTempDir();
    makeTree(root, ["pages/index.tsx", "src/app/x/page.tsx"]);
    expect(() => resolveRouteDirs(root)).toThrow(/src\/app/);
  });

  it("tolerates non-page files in an ignored src dir", () => {
    // Only page files make the ignored dir hazardous; helpers and styles
    // under src/pages don't route in the first place.
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx", "src/pages/helpers.css"]);
    expect(resolveRouteDirs(root)).toEqual({
      appDir: join(root, "app"),
      pagesDir: undefined,
    });
  });

  it("treats a colliding ignored dir as populated (still the config error)", () => {
    // The probe scan throws a RouteCollisionError; that still proves the
    // ignored dir has page files, and the CONFIG error is the right one.
    const root = makeTempDir();
    makeTree(root, [
      "app/page.tsx",
      "src/pages/blog.tsx",
      "src/pages/blog/index.tsx",
    ]);
    expect(() => resolveRouteDirs(root)).toThrow(/silently unreachable/);
  });

  it("honors custom pageExtensions in the populated probe", () => {
    const root = makeTempDir();
    makeTree(root, ["app/", "src/pages/index.mdx"]);
    expect(resolveRouteDirs(root)).toMatchObject({ pagesDir: undefined });
    expect(() => resolveRouteDirs(root, ["mdx"])).toThrow(
      /silently unreachable/,
    );
  });
});

describe("scanRoutes orchestrator (PR1/PR9)", () => {
  it("scans a hybrid project into both unions", () => {
    const root = makeTempDir();
    makeTree(root, [
      "app/page.tsx",
      "app/product/[id]/page.tsx",
      "pages/legacy.tsx",
      "pages/legacy/[id].tsx",
    ]);
    expect(
      scanRoutes({
        appDir: join(root, "app"),
        pagesDir: join(root, "pages"),
      }),
    ).toEqual({
      appRoutes: ["/", "/product/[id]"],
      pagesRoutes: ["/legacy", "/legacy/[id]"],
    });
  });

  it("returns an empty union for an absent dir", () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx"]);
    expect(scanRoutes({ appDir: join(root, "app") })).toEqual({
      appRoutes: ["/"],
      pagesRoutes: [],
    });
    expect(scanRoutes({})).toEqual({ appRoutes: [], pagesRoutes: [] });
  });

  it("errors when a path exists in both routers (Next's conflicting-file error)", () => {
    const root = makeTempDir();
    makeTree(root, ["app/about/page.tsx", "pages/about.tsx"]);
    const dirs = { appDir: join(root, "app"), pagesDir: join(root, "pages") };
    expect(() => scanRoutes(dirs)).toThrow(RouteCollisionError);
    expect(() => scanRoutes(dirs)).toThrow(/"\/about"/);
  });

  it("names every colliding path, not just the first", () => {
    const root = makeTempDir();
    makeTree(root, [
      "app/a/page.tsx",
      "app/b/page.tsx",
      "pages/a.tsx",
      "pages/b.tsx",
    ]);
    expect(() =>
      scanRoutes({ appDir: join(root, "app"), pagesDir: join(root, "pages") }),
    ).toThrow(/"\/a", "\/b"/);
  });

  it("errors on a cross-router slug-name conflict on a shared prefix (PR9 structural)", () => {
    const root = makeTempDir();
    makeTree(root, ["app/x/[id]/page.tsx", "pages/x/[slug].tsx"]);
    expect(() =>
      scanRoutes({ appDir: join(root, "app"), pagesDir: join(root, "pages") }),
    ).toThrow(RouteCollisionError);
  });

  it("errors on cross-router optional-catch-all specificity (PR9 structural)", () => {
    const root = makeTempDir();
    makeTree(root, ["app/docs/page.tsx", "pages/docs/[[...slug]].tsx"]);
    expect(() =>
      scanRoutes({ appDir: join(root, "app"), pagesDir: join(root, "pages") }),
    ).toThrow(/same specificity/);
  });
});
