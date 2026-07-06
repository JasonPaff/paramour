import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `next/navigation` is stubbed for the client-hook render tests so no real
    // Next is materialized in the workspace (peer-only by design). Scoped to
    // that one specifier — no other test imports it.
    alias: {
      "next/navigation": fileURLToPath(
        new URL(
          "./packages/next/test/stubs/next-navigation.ts",
          import.meta.url,
        ),
      ),
    },
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
  },
});
