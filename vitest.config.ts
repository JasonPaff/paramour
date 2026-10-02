import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `next` is peer-only (never materialized in the workspace), but the hook
// entries statically import `next/navigation.js` / `next/router.js` for their
// real-Next fallback adapters, so Vite still needs the specifiers to
// RESOLVE. Both map to one inert shim whose exports all throw: tests drive
// the adapter seam through `@paramour-js/next/testing`'s provider, never the
// fallback. Both keys are the extensionful specifiers app.ts and pages.ts
// actually import (Node ESM resolution — see pages.ts).
const nextAbsent = fileURLToPath(
  new URL("./packages/next/test/next-absent.ts", import.meta.url),
);

export default defineConfig({
  test: {
    alias: {
      "next/navigation.js": nextAbsent,
      "next/router.js": nextAbsent,
    },
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
  },
});
