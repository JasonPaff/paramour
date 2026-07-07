import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Smoke tests of the BUILT client entry — the packaging seams the in-process
 * suites cannot see. Skipped when dist is absent locally (same gate as
 * cli-dist.test.ts); always runs in CI because `pnpm build` precedes
 * `pnpm test` there.
 */
const distClientJs = fileURLToPath(
  new URL("../dist/client.js", import.meta.url),
);
const distClientDts = fileURLToPath(
  new URL("../dist/client.d.ts", import.meta.url),
);

describe.skipIf(!existsSync(distClientJs))(
  "dist client entry (packaging)",
  () => {
    it('dist/client.js keeps the "use client" RSC boundary banner through tsc', () => {
      const content = readFileSync(distClientJs, "utf8");
      expect(content.startsWith('"use client";')).toBe(true);
    });

    it("dist/client.d.ts is hermetic: no next/navigation type import leaks", () => {
      // The hermeticity claim of src/types/next-navigation.d.ts: the ambient
      // module is a build-time input only, so consumers' type-checking never
      // needs `next` installed.
      const content = readFileSync(distClientDts, "utf8");
      expect(content).not.toContain("next/navigation");
    });
  },
);
