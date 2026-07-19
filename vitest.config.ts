import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `next/navigation` and `next/router.js` are stubbed for the app/pages
    // hook render tests so no real Next is materialized in the workspace
    // (peer-only by design). Scoped to those two specifiers — no other test
    // imports them. The router key is the extensionful specifier pages.ts
    // actually imports (Next 15 ESM externalization — see pages.ts).
    alias: {
      "next/navigation": fileURLToPath(
        new URL(
          "./packages/next/test/stubs/next-navigation.ts",
          import.meta.url,
        ),
      ),
      "next/router.js": fileURLToPath(
        new URL("./packages/next/test/stubs/next-router.ts", import.meta.url),
      ),
    },
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
  },
});
