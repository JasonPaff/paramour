import type { TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

/**
 * Extracts the string value of a static path expression: a string literal or
 * an expression-free template literal. Dynamic strings return null — out of
 * scope for v1.
 */
export function getStaticPath(node: TSESTree.Node): null | string {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === "string") {
    return node.value;
  }
  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0
  ) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}
