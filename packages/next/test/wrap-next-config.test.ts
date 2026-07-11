import { describe, expect, it } from "vitest";

import {
  detectWrapState,
  findNextConfig,
  wrapNextConfigSource,
} from "../src/init/wrap-next-config.js";
import { makeTempDir, makeTree } from "./helpers.js";

const IDENTIFIER_TS = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

describe("wrapNextConfigSource", () => {
  it("wraps an identifier default export, adding the import", async () => {
    const result = await wrapNextConfigSource(IDENTIFIER_TS);
    expect(result.status).toBe("wrapped");
    if (result.status !== "wrapped") return;
    expect(result.code).toContain(
      `import {withTypedRoutes} from "@paramour-js/next";`,
    );
    expect(result.code).toContain(
      "export default withTypedRoutes(nextConfig);",
    );
    // The untouched parts keep their original formatting (recast).
    expect(result.code).toContain("  reactStrictMode: true,");
  });

  it("wraps an object-literal default export", async () => {
    const result = await wrapNextConfigSource(
      `export default { reactStrictMode: true };\n`,
    );
    expect(result.status).toBe("wrapped");
    if (result.status !== "wrapped") return;
    expect(result.code).toContain("export default withTypedRoutes({");
  });

  it("wraps OUTSIDE an existing wrapper call", async () => {
    const result = await wrapNextConfigSource(
      `import withBundleAnalyzer from "@next/bundle-analyzer";
const nextConfig = { reactStrictMode: true };
export default withBundleAnalyzer(nextConfig);
`,
    );
    expect(result.status).toBe("wrapped");
    if (result.status !== "wrapped") return;
    expect(result.code).toContain(
      "export default withTypedRoutes(withBundleAnalyzer(nextConfig));",
    );
  });

  it("wraps an arrow-function (config-function form) default export", async () => {
    const result = await wrapNextConfigSource(
      `export default (phase) => ({ reactStrictMode: true });\n`,
    );
    expect(result.status).toBe("wrapped");
    if (result.status !== "wrapped") return;
    expect(result.code).toContain(
      "export default withTypedRoutes((phase) => ({",
    );
  });

  it("wraps a `satisfies`-typed identifier export", async () => {
    const result = await wrapNextConfigSource(
      `const nextConfig = { reactStrictMode: true } satisfies { reactStrictMode: boolean };
export default nextConfig;
`,
    );
    expect(result.status).toBe("wrapped");
  });

  it("is idempotent: its own output re-wraps as already-wrapped", async () => {
    const first = await wrapNextConfigSource(IDENTIFIER_TS);
    expect(first.status).toBe("wrapped");
    if (first.status !== "wrapped") return;
    const second = await wrapNextConfigSource(first.code);
    expect(second).toEqual({ status: "already-wrapped" });
  });

  it("detects an aliased import as already-wrapped", async () => {
    const result = await wrapNextConfigSource(
      `import { withTypedRoutes as wtr } from "@paramour-js/next";
export default wtr({}, { strict: true });
`,
    );
    expect(result).toEqual({ status: "already-wrapped" });
  });

  it("detects a namespace-import wrap as already-wrapped (never double-wraps)", async () => {
    const source = `import * as pn from "@paramour-js/next";
export default pn.withTypedRoutes({ reactStrictMode: true });
`;
    await expect(wrapNextConfigSource(source)).resolves.toEqual({
      status: "already-wrapped",
    });
    await expect(detectWrapState(source)).resolves.toBe("wrapped");
  });

  it("falls back to manual for CJS module.exports (package is ESM-only)", async () => {
    const result = await wrapNextConfigSource(
      `module.exports = { reactStrictMode: true };\n`,
    );
    expect(result.status).toBe("manual");
    if (result.status !== "manual") return;
    expect(result.snippet).toContain(
      `import { withTypedRoutes } from "@paramour-js/next";`,
    );
    expect(result.snippet).toContain("export default withTypedRoutes(");
  });

  it("falls back to manual for a function-declaration default export", async () => {
    const result = await wrapNextConfigSource(
      `export default function config(phase) { return {}; }\n`,
    );
    expect(result.status).toBe("manual");
  });

  it("falls back to manual for unparseable source", async () => {
    const result = await wrapNextConfigSource(`export default {{{\n`);
    expect(result.status).toBe("manual");
  });

  it("falls back to manual when there is no default export", async () => {
    const result = await wrapNextConfigSource(
      `export const config = { reactStrictMode: true };\n`,
    );
    expect(result.status).toBe("manual");
  });
});

describe("detectWrapState", () => {
  it("classifies wrapped, not-wrapped, and unparseable sources", async () => {
    const wrapped = await wrapNextConfigSource(IDENTIFIER_TS);
    if (wrapped.status !== "wrapped") throw new Error("wrap failed");
    await expect(detectWrapState(wrapped.code)).resolves.toBe("wrapped");
    await expect(detectWrapState(IDENTIFIER_TS)).resolves.toBe("not-wrapped");
    await expect(detectWrapState(`export default {{{`)).resolves.toBe(
      "unparseable",
    );
  });

  it("an import without a wrapping call is not-wrapped", async () => {
    await expect(
      detectWrapState(
        `import { withTypedRoutes } from "@paramour-js/next";
export default { reactStrictMode: true };
`,
      ),
    ).resolves.toBe("not-wrapped");
  });
});

describe("findNextConfig", () => {
  it("prefers ts over mjs over js and returns undefined when absent", () => {
    const root = makeTempDir();
    expect(findNextConfig(root)).toBeUndefined();
    makeTree(root, ["next.config.js"]);
    expect(findNextConfig(root)?.lang).toBe("js");
    makeTree(root, ["next.config.mjs"]);
    expect(findNextConfig(root)?.lang).toBe("mjs");
    makeTree(root, ["next.config.ts"]);
    expect(findNextConfig(root)?.lang).toBe("ts");
  });
});
