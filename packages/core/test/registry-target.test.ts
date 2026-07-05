import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Tripwire for the world-B registry suite's module-identity assumption.
 *
 * tsconfig.tstyche.registry.json paths-maps "paramour" to ./src/index.ts, so
 * `pnpm test:types:registry` certifies the `declare module "paramour"`
 * augmentation against SOURCE — not against whatever a future build step
 * publishes as the types entry. A declaration bundler that renames, inlines,
 * or drops the empty `ParamourRegister` interface would break consumer
 * augmentation while the registry suite stays green, because its paths
 * override keeps resolving to src.
 *
 * This test fails the moment package.json gains a published types surface or
 * a build script, forcing the retarget decision to be made explicitly. When
 * that happens: point the registry tsconfig's paths mapping at the BUILT
 * types entry (or add a second registry run against it), then update or
 * delete this guard.
 */

interface PackageManifest {
  exports?: unknown;
  main?: unknown;
  scripts?: Record<string, string>;
  types?: unknown;
}

const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;

const registryTsconfig = readFileSync(
  new URL("../tsconfig.tstyche.registry.json", import.meta.url),
  "utf8",
);

describe("registry suite targets the real module identity", () => {
  it("still paths-maps paramour to src (otherwise update this guard)", () => {
    expect(
      registryTsconfig,
      "tsconfig.tstyche.registry.json no longer maps paramour to ./src/index.ts — " +
        "if it now targets the built types entry, update or delete this guard",
    ).toContain('"paramour": ["./src/index.ts"]');
  });

  it("package.json declares no built types surface the suite would miss", () => {
    const divergenceMessage =
      "packages/core now publishes a types surface, but the registry suite " +
      "still certifies the augmentation against src/index.ts via the paths " +
      "mapping in tsconfig.tstyche.registry.json. Retarget it at the built " +
      "types entry so d.ts bundling cannot silently break ParamourRegister " +
      "augmentation, then update this test.";

    expect(packageManifest.exports, divergenceMessage).toBeUndefined();
    expect(packageManifest.main, divergenceMessage).toBeUndefined();
    expect(packageManifest.types, divergenceMessage).toBeUndefined();
    expect(packageManifest.scripts?.build, divergenceMessage).toBeUndefined();
  });
});
