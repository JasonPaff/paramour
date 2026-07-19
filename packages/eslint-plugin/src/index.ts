import type { TSESLint } from "@typescript-eslint/utils";

import { noRawHrefs } from "./rules/no-raw-hrefs.js";

// meta.version is intentionally hardcoded (importing package.json would break
// the build's rootDir) — it is debug/cache-key metadata only and may lag the
// published version.
const plugin = {
  meta: {
    name: "@paramour-js/eslint-plugin",
    namespace: "paramour",
    version: "0.1.0",
  },
  rules: {
    "no-raw-hrefs": noRawHrefs,
  },
};

const recommended: TSESLint.FlatConfig.Config = {
  name: "paramour/recommended",
  plugins: {
    paramour: plugin,
  },
  rules: {
    "paramour/no-raw-hrefs": "warn",
  },
};

export default {
  ...plugin,
  configs: {
    recommended,
  },
};
