import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { emitArtifact } from "../src/emit.js";
import {
  checkArtifact,
  formatRouteDiff,
  generate,
  type GenerateInputs,
  parseArtifactRoutes,
} from "../src/generate.js";
import { makeTempDir, makeTree } from "./helpers.js";

/** Temp project with the given tree; returns ready-to-use inputs. */
function makeInputs(entries: readonly string[]): GenerateInputs {
  const root = makeTempDir();
  makeTree(root, entries);
  return {
    appDir: entries.some((entry) => entry.startsWith("app/"))
      ? join(root, "app")
      : undefined,
    artifactPath: join(root, "paramour-env.d.ts"),
    pageExtensions: ["tsx"],
    pagesDir: entries.some((entry) => entry.startsWith("pages/"))
      ? join(root, "pages")
      : undefined,
  };
}

describe("generate (TR9 shared engine)", () => {
  it("scans a hybrid project, writes the artifact, and reports both unions", () => {
    const inputs = makeInputs([
      "app/page.tsx",
      "app/about/page.tsx",
      "pages/legacy.tsx",
    ]);
    const result = generate(inputs);
    expect(result.appRoutes).toEqual(["/", "/about"]);
    expect(result.pagesRoutes).toEqual(["/legacy"]);
    expect(result.written).toBe(true);
    expect(result.previousContent).toBeNull();
    expect(readFileSync(inputs.artifactPath, "utf8")).toBe(
      emitArtifact({ appRoutes: ["/", "/about"], pagesRoutes: ["/legacy"] }),
    );
  });

  it("emits an app-only artifact with pagesRoutes absent", () => {
    const inputs = makeInputs(["app/page.tsx"]);
    generate(inputs);
    const content = readFileSync(inputs.artifactPath, "utf8");
    expect(content).toContain("appRoutes:");
    expect(content).not.toContain("pagesRoutes");
  });

  it("emits a pages-only artifact with appRoutes absent", () => {
    const inputs = makeInputs(["pages/index.tsx"]);
    const result = generate(inputs);
    expect(result.appRoutes).toEqual([]);
    expect(result.pagesRoutes).toEqual(["/"]);
    const content = readFileSync(inputs.artifactPath, "utf8");
    expect(content).toContain("pagesRoutes:");
    expect(content).not.toContain("appRoutes");
  });

  it("is a byte-identical no-op on a second pass (mtime untouched)", () => {
    const inputs = makeInputs(["app/page.tsx", "pages/legacy.tsx"]);
    generate(inputs);
    const before = statSync(inputs.artifactPath).mtimeMs;
    const result = generate(inputs);
    expect(result.written).toBe(false);
    expect(statSync(inputs.artifactPath).mtimeMs).toBe(before);
  });

  it("propagates an app/pages collision instead of writing (PR9)", () => {
    const inputs = makeInputs(["app/about/page.tsx", "pages/about.tsx"]);
    expect(() => generate(inputs)).toThrow(/collision/);
    expect(() => readFileSync(inputs.artifactPath, "utf8")).toThrow(/ENOENT/);
  });
});

describe("checkArtifact (TR7 --check)", () => {
  it("reports up to date for a fresh artifact", () => {
    const inputs = makeInputs(["app/page.tsx", "pages/legacy.tsx"]);
    generate(inputs);
    expect(checkArtifact(inputs)).toEqual({
      app: { appeared: [], disappeared: [] },
      missingFile: false,
      pages: { appeared: [], disappeared: [] },
      upToDate: true,
    });
  });

  it("treats a missing artifact as drift, listing every route as new per router", () => {
    const inputs = makeInputs(["app/page.tsx", "pages/legacy.tsx"]);
    const result = checkArtifact(inputs);
    expect(result).toMatchObject({ missingFile: true, upToDate: false });
    expect(result.app.appeared).toEqual(["/"]);
    expect(result.pages.appeared).toEqual(["/legacy"]);
    expect(result.app.disappeared).toEqual([]);
    expect(result.pages.disappeared).toEqual([]);
  });

  it("diffs a stale artifact per router without writing", () => {
    const inputs = makeInputs([
      "app/page.tsx",
      "app/new/page.tsx",
      "pages/fresh.tsx",
    ]);
    const stale = emitArtifact({
      appRoutes: ["/", "/old"],
      pagesRoutes: ["/gone"],
    });
    writeFileSync(inputs.artifactPath, stale);
    const result = checkArtifact(inputs);
    expect(result).toMatchObject({ missingFile: false, upToDate: false });
    expect(result.app.appeared).toEqual(["/new"]);
    expect(result.app.disappeared).toEqual(["/old"]);
    expect(result.pages.appeared).toEqual(["/fresh"]);
    expect(result.pages.disappeared).toEqual(["/gone"]);
    // --check never writes (TR7).
    expect(readFileSync(inputs.artifactPath, "utf8")).toBe(stale);
  });

  it("flags byte drift even when the route set matches", () => {
    const inputs = makeInputs(["app/page.tsx"]);
    // Hand-edited artifact: same union, different bytes (header dropped).
    writeFileSync(
      inputs.artifactPath,
      emitArtifact({ appRoutes: ["/"], pagesRoutes: [] })
        .split("\n")
        .slice(1)
        .join("\n"),
    );
    const result = checkArtifact(inputs);
    expect(result.upToDate).toBe(false);
    expect(result.app).toEqual({ appeared: [], disappeared: [] });
    expect(result.pages).toEqual({ appeared: [], disappeared: [] });
  });

  it("does not cross-attribute drift between routers (a moved route names both)", () => {
    // The same URL path migrating app → pages must show as disappeared(app)
    // AND appeared(pages) — the report names which router moved (PR9).
    const inputs = makeInputs(["pages/about.tsx"]);
    writeFileSync(
      inputs.artifactPath,
      emitArtifact({ appRoutes: ["/about"], pagesRoutes: [] }),
    );
    const result = checkArtifact(inputs);
    expect(result.app.disappeared).toEqual(["/about"]);
    expect(result.pages.appeared).toEqual(["/about"]);
  });
});

describe("parseArtifactRoutes / formatRouteDiff", () => {
  it("round-trips the per-router paths of an emitted artifact", () => {
    const appRoutes = ["/", "/a/[id]"];
    const pagesRoutes = ["/b/[...slug]", "/legacy"];
    const parsed = parseArtifactRoutes(
      emitArtifact({ appRoutes, pagesRoutes }),
    );
    expect([...parsed.appRoutes].sort()).toEqual(appRoutes);
    expect([...parsed.pagesRoutes].sort()).toEqual(pagesRoutes);
  });

  it("returns empty sets for a missing file and the empty merge", () => {
    expect(parseArtifactRoutes(null).appRoutes.size).toBe(0);
    expect(parseArtifactRoutes(null).pagesRoutes.size).toBe(0);
    const empty = parseArtifactRoutes(
      emitArtifact({ appRoutes: [], pagesRoutes: [] }),
    );
    expect(empty.appRoutes.size).toBe(0);
    expect(empty.pagesRoutes.size).toBe(0);
  });

  it("parses a single-member artifact into the right router", () => {
    const parsed = parseArtifactRoutes(
      emitArtifact({ appRoutes: [], pagesRoutes: ["/legacy"] }),
    );
    expect(parsed.appRoutes.size).toBe(0);
    expect([...parsed.pagesRoutes]).toEqual(["/legacy"]);
  });

  it("tolerates a CRLF-resaved artifact", () => {
    // A drift diff against a CRLF-converted artifact must not report every
    // route as newly appeared — the members still parse.
    const crlf = emitArtifact({
      appRoutes: ["/a"],
      pagesRoutes: ["/b"],
    }).replaceAll("\n", "\r\n");
    const parsed = parseArtifactRoutes(crlf);
    expect([...parsed.appRoutes]).toEqual(["/a"]);
    expect([...parsed.pagesRoutes]).toEqual(["/b"]);
  });

  it("formats appeared and disappeared lines naming the router", () => {
    expect(
      formatRouteDiff(
        { appeared: ["/new"], disappeared: ["/old"] },
        { appeared: ["/legacy"], disappeared: [] },
      ),
    ).toEqual(["  + /new (app)", "  + /legacy (pages)", "  - /old (app)"]);
  });
});
