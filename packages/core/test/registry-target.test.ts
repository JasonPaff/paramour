import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Tripwire for the world-B registry suite's module-identity assumption.
 *
 * tsconfig.tstyche.registry.json paths-maps "paramour" to ./dist/index.d.ts
 * — the same file package.json's exports publishes as the types entry — so
 * `pnpm test:types:registry` certifies the `declare module "paramour"`
 * augmentation against what real consumers see. If the published types path
 * and the registry mapping ever diverge (a d.ts bundler, a new entry point),
 * a build could break ParamourRegister augmentation while the suite stays
 * green against the stale target. These tests pin the two together.
 */

interface PackageManifest {
  exports?: Record<string, { types?: string }>;
}

const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;

const registryTsconfig = readFileSync(
  new URL("../tsconfig.tstyche.registry.json", import.meta.url),
  "utf8",
);

describe("registry suite targets the real module identity", () => {
  it("paths-maps paramour to the built types entry", () => {
    expect(
      registryTsconfig,
      "tsconfig.tstyche.registry.json no longer maps paramour to " +
        "./dist/index.d.ts — retarget the registry suite at whatever " +
        "package.json exports as types, then update this guard",
    ).toContain('"paramour": ["./dist/index.d.ts"]');
  });

  it("the published types entry is the file the suite certifies", () => {
    expect(
      packageManifest.exports?.["."]?.types,
      "package.json's exported types entry moved — retarget " +
        "tsconfig.tstyche.registry.json's paths mapping to match, then " +
        "update this guard",
    ).toBe("./dist/index.d.ts");
  });
});
