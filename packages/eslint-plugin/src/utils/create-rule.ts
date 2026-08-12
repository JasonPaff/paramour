import { ESLintUtils } from "@typescript-eslint/utils";

export const DOCS_URL = "https://paramour.dev/docs/reference/eslint-plugin";

// The docs page carries one `## <rule-name>` section per rule, so the anchor
// pattern below only works while those headings match the rule names exactly.
export const createRule = ESLintUtils.RuleCreator(
  (name) => `${DOCS_URL}#${name}`,
);
