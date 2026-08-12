import type { TSESLint } from "@typescript-eslint/utils";

import { noHrefArithmetic } from "./rules/no-href-arithmetic.js";
import { noRawHrefs } from "./rules/no-raw-hrefs.js";
import { noRawParamReads } from "./rules/no-raw-param-reads.js";

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
    "no-href-arithmetic": noHrefArithmetic,
    "no-raw-hrefs": noRawHrefs,
    "no-raw-param-reads": noRawParamReads,
  },
};

const recommended: TSESLint.FlatConfig.Config = {
  name: "paramour/recommended",
  plugins: {
    paramour: plugin,
  },
  rules: {
    "paramour/no-href-arithmetic": "warn",
    "paramour/no-raw-hrefs": "warn",
    "paramour/no-raw-param-reads": "warn",
  },
};

export default {
  ...plugin,
  configs: {
    recommended,
  },
};
