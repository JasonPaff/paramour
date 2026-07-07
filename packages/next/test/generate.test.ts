import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { emitArtifact } from "../src";
import {
  checkArtifact,
  formatRouteDiff,
  generate,
  type GenerateInputs,
  parseUnionPaths,
} from "../src/generate.js";
import { makeTempDir, makeTree } from "./helpers.js";

/** Temp project with the given app tree; returns ready-to-use inputs. */
function makeInputs(entries: readonly string[]): GenerateInputs {
  const root = makeTempDir();
  makeTree(root, entries);
  return {
    appDir: join(root, "app"),
    artifactPath: join(root, "paramour-env.d.ts"),
    pageExtensions: ["tsx"],
  };
}

describe("generate (TR9 shared engine)", () => {
  it("scans, writes the artifact, and reports the routes", () => {
    const inputs = makeInputs(["app/page.tsx", "app/about/page.tsx"]);
    const result = generate(inputs);
    expect(result.routes).toEqual(["/", "/about"]);
    expect(result.written).toBe(true);
    expect(result.previousContent).toBeNull();
    expect(readFileSync(inputs.artifactPath, "utf8")).toBe(
      emitArtifact(["/", "/about"]),
    );
  });

  it("is a byte-identical no-op on a second pass (mtime untouched)", () => {
    const inputs = makeInputs(["app/page.tsx"]);
    generate(inputs);
    const before = statSync(inputs.artifactPath).mtimeMs;
    const result = generate(inputs);
    expect(result.written).toBe(false);
    expect(statSync(inputs.artifactPath).mtimeMs).toBe(before);
  });
});

describe("checkArtifact (TR7 --check)", () => {
  it("reports up to date for a fresh artifact", () => {
    const inputs = makeInputs(["app/page.tsx"]);
    generate(inputs);
    expect(checkArtifact(inputs)).toEqual({
      appeared: [],
      disappeared: [],
      missingFile: false,
      upToDate: true,
    });
  });

  it("treats a missing artifact as drift, listing every route as new", () => {
    const inputs = makeInputs(["app/page.tsx"]);
    const result = checkArtifact(inputs);
    expect(result).toMatchObject({ missingFile: true, upToDate: false });
    expect(result.appeared).toEqual(["/"]);
    expect(result.disappeared).toEqual([]);
  });

  it("diffs a stale artifact without writing", () => {
    const inputs = makeInputs(["app/page.tsx", "app/new/page.tsx"]);
    const stale = emitArtifact(["/", "/old"]);
    writeFileSync(inputs.artifactPath, stale);
    const result = checkArtifact(inputs);
    expect(result).toMatchObject({ missingFile: false, upToDate: false });
    expect(result.appeared).toEqual(["/new"]);
    expect(result.disappeared).toEqual(["/old"]);
    // --check never writes (TR7).
    expect(readFileSync(inputs.artifactPath, "utf8")).toBe(stale);
  });

  it("flags byte drift even when the route set matches", () => {
    const inputs = makeInputs(["app/page.tsx"]);
    // Hand-edited artifact: same union, different bytes (header dropped).
    writeFileSync(
      inputs.artifactPath,
      emitArtifact(["/"]).split("\n").slice(1).join("\n"),
    );
    const result = checkArtifact(inputs);
    expect(result.upToDate).toBe(false);
    expect(result.appeared).toEqual([]);
    expect(result.disappeared).toEqual([]);
  });
});

describe("parseUnionPaths / formatRouteDiff", () => {
  it("round-trips the paths of an emitted artifact", () => {
    const paths = ["/", "/a/[id]", "/b/[...slug]"];
    expect([...parseUnionPaths(emitArtifact(paths))].sort()).toEqual(
      [...paths].sort(),
    );
  });

  it("returns an empty set for a missing file and the empty merge", () => {
    expect(parseUnionPaths(null).size).toBe(0);
    expect(parseUnionPaths(emitArtifact([])).size).toBe(0);
  });

  it("tolerates a CRLF-resaved artifact (JS multiline $ matches before \\r)", () => {
    // A drift diff against a CRLF-converted artifact must not report every
    // route as newly appeared — the union members still parse.
    const crlf = emitArtifact(["/a", "/b"]).replaceAll("\n", "\r\n");
    expect([...parseUnionPaths(crlf)].sort()).toEqual(["/a", "/b"]);
  });

  it("formats appeared and disappeared lines", () => {
    expect(formatRouteDiff(["/new"], ["/old", "/older"])).toEqual([
      "  + /new",
      "  - /old",
      "  - /older",
    ]);
  });
});
