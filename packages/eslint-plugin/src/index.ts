import type { TSESLint } from "@typescript-eslint/utils";

import { createRequire } from "node:module";

import { noHrefArithmetic } from "./rules/no-href-arithmetic.js";
import { noImpureValueDefaults } from "./rules/no-impure-value-defaults.js";
import { noParseContextInGetStaticProps } from "./rules/no-parse-context-in-get-static-props.js";
import { noRawHrefs } from "./rules/no-raw-hrefs.js";
import { noRawParamReads } from "./rules/no-raw-param-reads.js";

// meta.version feeds ESLint's cache keys, so it must track the published
// version. Read at runtime rather than imported: a static package.json import
// would pull the file into the build's rootDir. `../package.json` resolves
// from both src/ (tests) and dist/ (published) — the tarball ships it.
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const plugin = {
  meta: {
    name: "@paramour-js/eslint-plugin",
    namespace: "paramour",
    version,
  },
  rules: {
    "no-href-arithmetic": noHrefArithmetic,
    "no-impure-value-defaults": noImpureValueDefaults,
    "no-parse-context-in-get-static-props": noParseContextInGetStaticProps,
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
    "paramour/no-impure-value-defaults": "warn",
    "paramour/no-parse-context-in-get-static-props": "warn",
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
