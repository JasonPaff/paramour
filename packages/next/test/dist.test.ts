import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Smoke tests of the BUILT app entry — the packaging seams the in-process
 * suites cannot see. Skipped when dist is absent locally (same gate as
 * cli-dist.test.ts); always runs in CI because `pnpm build` precedes
 * `pnpm test` there.
 */
const distAppJs = fileURLToPath(new URL("../dist/app.js", import.meta.url));
const distAppDts = fileURLToPath(new URL("../dist/app.d.ts", import.meta.url));

describe.skipIf(!existsSync(distAppJs))("dist app entry (packaging)", () => {
  it('dist/app.js keeps the "use client" RSC boundary banner through tsc', () => {
    const content = readFileSync(distAppJs, "utf8");
    expect(content.startsWith('"use client";')).toBe(true);
  });

  it("dist/app.d.ts is hermetic: no next/navigation type import leaks", () => {
    // The hermeticity claim of src/types/next-navigation.d.ts: the ambient
    // module is a build-time input only, so consumers' type-checking never
    // needs `next` installed.
    const content = readFileSync(distAppDts, "utf8");
    expect(content).not.toContain("next/navigation");
  });
});
