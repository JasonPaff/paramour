import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Smoke tests of the BUILT app/pages entries — the packaging seams the
 * in-process suites cannot see. Skipped when dist is absent locally (same
 * gate as cli-dist.test.ts); always runs in CI because `pnpm build` precedes
 * `pnpm test` there.
 */
const distAppJs = fileURLToPath(new URL("../dist/app.js", import.meta.url));
const distAppDts = fileURLToPath(new URL("../dist/app.d.ts", import.meta.url));
const distPagesJs = fileURLToPath(new URL("../dist/pages.js", import.meta.url));
const distPagesDts = fileURLToPath(
  new URL("../dist/pages.d.ts", import.meta.url),
);
const distSeamJs = fileURLToPath(
  new URL("../dist/devtools-seam.js", import.meta.url),
);
const distSeamDts = fileURLToPath(
  new URL("../dist/devtools-seam.d.ts", import.meta.url),
);

/**
 * Every import specifier reachable from `entry` through RELATIVE imports —
 * the module graph a bundler would pull into the consumer's bundle. External
 * specifiers are collected, not followed: the assertion is about what THIS
 * package's graph reaches for, and tsc's ESM output keeps one static import
 * per line, so a specifier regex is sufficient (no dynamic imports in dist).
 */
function reachableSpecifiers(entry: string): Set<string> {
  const specifiers = new Set<string>();
  const visited = new Set<string>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:^|\n)(?:import|export)[^\n]*?from\s+"([^"]+)"|(?:^|\n)import\s+"([^"]+)"/g,
    )) {
      const specifier = match[1] ?? match[2];
      if (specifier === undefined) continue;
      specifiers.add(specifier);
      if (specifier.startsWith(".")) {
        queue.push(resolve(dirname(file), specifier));
      }
    }
  }
  return specifiers;
}

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

  it("no next/router is reachable from /app (PR2 bundle hygiene)", () => {
    const specifiers = reachableSpecifiers(distAppJs);
    // Guard the guard: an entry that stopped importing its own router would
    // make the negative assertion pass vacuously.
    expect(specifiers).toContain("next/navigation");
    expect(specifiers).not.toContain("next/router");
    expect(specifiers).not.toContain("next/router.js");
  });
});

describe.skipIf(!existsSync(distPagesJs))(
  "dist pages entry (packaging)",
  () => {
    it('dist/pages.js carries NO "use client" directive (PR2)', () => {
      // The directive is an App Router (RSC graph) concept; in a pages/
      // bundle it is at best noise. Its absence is deliberate, not an
      // emit accident — pin it.
      const content = readFileSync(distPagesJs, "utf8");
      expect(content.startsWith('"use client";')).toBe(false);
    });

    it("dist/pages.d.ts is hermetic: no next/router type import leaks", () => {
      // The same hermeticity claim as the app entry, for
      // src/types/next-router.d.ts (PR13).
      const content = readFileSync(distPagesDts, "utf8");
      expect(content).not.toContain("next/router");
      expect(content).not.toContain("next/navigation");
    });

    it("no next/navigation is reachable from /pages (PR2 bundle hygiene)", () => {
      const specifiers = reachableSpecifiers(distPagesJs);
      // Extensionful on purpose — the bare specifier dies under Node ESM
      // externalization on Next 15 (see src/pages.ts).
      expect(specifiers).toContain("next/router.js");
      expect(specifiers).not.toContain("next/router");
      expect(specifiers).not.toContain("next/navigation");
    });
  },
);

describe.skipIf(!existsSync(distSeamJs))(
  "dist devtools-seam entry (packaging, design-12 DT6)",
  () => {
    it("dist/devtools-seam.js imports NOTHING (erasability precondition)", () => {
      // Every consumer call site sits behind a constant-folded NODE_ENV
      // guard; with sideEffects:false the module drops from prod bundles
      // only if its own emitted JS pulls in nothing else.
      const specifiers = reachableSpecifiers(distSeamJs);
      expect(specifiers.size).toBe(0);
    });

    it("dist/devtools-seam.d.ts references only paramour types (hermeticity)", () => {
      const content = readFileSync(distSeamDts, "utf8");
      expect(content).toContain('from "paramour"');
      expect(content).not.toContain("next/navigation");
      expect(content).not.toContain("next/router");
    });
  },
);
