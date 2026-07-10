import type { ParamourConfig } from "@paramour-js/next";

// The CLI's config file (TR7). `paramour generate` (and `--check`/`--watch`)
// read this; `withTypedRoutes` in next.config.ts does NOT — it takes its
// options inline, so keep `outFile` here equal to the wrapper's default. Every
// value below is set to its own default purely to show the surface; delete the
// file and codegen behaves identically. Unknown keys are a hard error (a
// `pagesExtensions` typo won't be silently ignored).
export default {
  appDir: "app",
  outFile: "paramour-env.d.ts",
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  pagesDir: "pages",
} satisfies ParamourConfig;
