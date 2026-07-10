import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeEach, describe, expect, it } from "vitest";

import {
  emitArtifact,
  resolveAppDir,
  scanRoutes,
  writeIfChanged,
} from "../src";
import { makeTempDir, makeTree } from "./helpers.js";

/**
 * World A/B integration test — the runtime twin of core's `test-registry`
 * type suite (design-05 testing plan). Generates a real artifact through the
 * scan → emit → write pipeline, then type-checks a consumer twice with the
 * compiler API: without the artifact in the program (world A: any literal
 * accepted via the RL8 `string` fallback) and with it (world B: unregistered
 * literals fail at `defineAppRoute`).
 */

// The "paramour" specifier is paths-mapped to src (winning over core's
// exports map) — the same module identity core's tsconfig.tstyche.registry
// config maps and registry-target.test.ts tripwires.
const coreIndex = fileURLToPath(
  new URL("../../core/src/index.ts", import.meta.url),
);
// The temp project has no node_modules; point typeRoots back into the repo
// (core's search.ts needs @types/node for URLSearchParams under lib ES2023).
const typesRoot = fileURLToPath(
  new URL("../node_modules/@types", import.meta.url),
);

const CONSUMER = `import { defineAppRoute } from "paramour";

export const good = defineAppRoute("/about", {});
export const bad = defineAppRoute("/nope", {});
`;

function checkProgram(rootNames: readonly string[]): string[] {
  const { errors, options } = ts.convertCompilerOptionsFromJson(
    {
      exactOptionalPropertyTypes: true,
      lib: ["ES2023"],
      module: "esnext",
      moduleResolution: "bundler",
      noEmit: true,
      noUncheckedIndexedAccess: true,
      paths: { paramour: [coreIndex] },
      skipLibCheck: true,
      strict: true,
      target: "es2022",
      typeRoots: [typesRoot],
      types: ["node"],
    },
    // Base path for relative option values; everything above is absolute.
    fileURLToPath(new URL(".", import.meta.url)),
  );
  expect(errors).toEqual([]);
  const program = ts.createProgram({ options, rootNames: [...rootNames] });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const file = diagnostic.file?.fileName.replaceAll("\\", "/") ?? "<global>";
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n",
    );
    return `${file} TS${String(diagnostic.code)}: ${message}`;
  });
}

describe("generated artifact flips defineAppRoute verification on (TR3/RL8)", () => {
  let artifactPath: string;
  let consumerPath: string;

  // Per-test setup: makeTempDir registers an afterEach cleanup, so the temp
  // project must be rebuilt for each world. The pipeline is milliseconds; the
  // program creation is the slow part anyway.
  beforeEach(() => {
    const projectRoot = makeTempDir();
    makeTree(projectRoot, ["app/page.tsx", "app/about/page.tsx"]);

    const appDir = resolveAppDir(projectRoot);
    if (appDir === undefined) throw new Error("app dir not resolved");
    const routes = scanRoutes(appDir);
    expect(routes).toEqual(["/", "/about"]);

    artifactPath = join(projectRoot, "paramour-env.d.ts");
    expect(writeIfChanged(artifactPath, emitArtifact(routes)).written).toBe(
      true,
    );

    consumerPath = join(projectRoot, "consumer.ts");
    writeFileSync(consumerPath, CONSUMER);
  });

  it("world A — artifact outside the program: every literal accepted", () => {
    // The artifact exists on disk in both worlds; the rootNames list is the
    // world switch (nothing imports the artifact).
    expect(checkProgram([consumerPath])).toEqual([]);
  }, 30_000);

  it("world B — artifact in the program: unregistered literal rejected", () => {
    const diagnostics = checkProgram([artifactPath, consumerPath]);
    // Exactly one diagnostic also proves "/about" still compiles.
    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    expect(diagnostic).toContain("consumer.ts");
    expect(diagnostic).toContain("TS2345");
    expect(diagnostic).toContain('"/nope"');
  }, 30_000);
});
