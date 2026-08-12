import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule, DOCS_URL } from "../utils/create-rule.js";
import { getImportedCallee } from "../utils/imports.js";
import { getStaticPath } from "../utils/static-path.js";

type MessageIds = "hrefConcat" | "hrefHashConcat" | "hrefSearchConcat";
type Options = [];

/**
 * Collects the operands of a `+` chain in source order: `a + b + c` yields
 * [a, b, c]. Parentheses do not materialize in the AST, so grouping folds
 * away — which is fine, because only "does anything follow the href() result"
 * matters here.
 */
function flattenPlusChain(node: TSESTree.BinaryExpression): TSESTree.Node[] {
  const operands: TSESTree.Node[] = [];
  const walk = (expression: TSESTree.Node): void => {
    if (
      expression.type === AST_NODE_TYPES.BinaryExpression &&
      expression.operator === "+"
    ) {
      walk(expression.left);
      walk(expression.right);
      return;
    }
    operands.push(expression);
  };
  walk(node);
  return operands;
}

export const noHrefArithmetic = createRule<Options, MessageIds>({
  create(context) {
    const { sourceCode } = context;

    function isHrefCall(
      expression: TSESTree.Node,
    ): expression is TSESTree.CallExpression {
      if (expression.type !== AST_NODE_TYPES.CallExpression) return false;
      const binding = getImportedCallee(sourceCode, expression);
      return binding?.imported === "href" && binding.source === "paramour";
    }

    /**
     * True when the expression's rightmost produced string content is an
     * href() result: the call itself, a `+` chain ending in one, or a
     * template literal whose final quasi is empty and whose last expression
     * ends with one. The empty-final-quasi condition is what makes
     * double-reporting between the two visitors impossible: a template with
     * content after the href is claimed by the TemplateLiteral visitor and
     * never counts as "ending with href" for an enclosing `+` chain.
     */
    function endsWithHrefCall(expression: TSESTree.Node): boolean {
      if (isHrefCall(expression)) return true;
      if (
        expression.type === AST_NODE_TYPES.BinaryExpression &&
        expression.operator === "+"
      ) {
        return endsWithHrefCall(expression.right);
      }
      if (expression.type === AST_NODE_TYPES.TemplateLiteral) {
        const lastQuasi = expression.quasis[expression.quasis.length - 1];
        const lastExpression =
          expression.expressions[expression.expressions.length - 1];
        if (lastQuasi?.value.cooked !== "") return false;
        return lastExpression !== undefined && endsWithHrefCall(lastExpression);
      }
      return false;
    }

    /**
     * Builds the hash autofix, or returns null when any bail-out makes the
     * rewrite unprovable: the fix must be exactly semantics-preserving —
     * href() renders `hash` as a trailing "#<fragment>", byte-identical to
     * the flagged concatenation.
     */
    function buildHashFix(
      reportNode: TSESTree.Node,
      hrefCall: TSESTree.CallExpression,
      suffix: string,
    ): null | TSESLint.ReportFixFunction {
      const fragment = suffix.slice(1);
      const args = hrefCall.arguments;
      if (args.length === 0 || args.length > 2) return null;
      if (args.some((arg) => arg.type === AST_NODE_TYPES.SpreadElement))
        return null;
      const optionsArg = args[1];
      if (
        optionsArg !== undefined &&
        optionsArg.type !== AST_NODE_TYPES.ObjectExpression
      )
        return null;
      let firstProperty: TSESTree.ObjectLiteralElement | undefined;
      if (optionsArg) {
        for (const property of optionsArg.properties) {
          // A spread could carry a hash; a computed key could be "hash".
          if (property.type === AST_NODE_TYPES.SpreadElement) return null;
          if (property.computed) return null;
          const { key } = property;
          if (key.type === AST_NODE_TYPES.Identifier && key.name === "hash")
            return null;
          if (key.type === AST_NODE_TYPES.Literal && key.value === "hash")
            return null;
        }
        firstProperty = optionsArg.properties[0];
      }
      const closingParen = sourceCode.getLastToken(hrefCall);
      if (!closingParen) return null;
      // A trailing comma in the argument list would leave the insertion
      // point ambiguous — rare and Prettier-normalized away, so just bail.
      if (sourceCode.getTokenBefore(closingParen)?.value === ",") return null;
      // Removing the surrounding ranges would silently delete any comment
      // living outside the href call.
      const hasOutsideComments = sourceCode
        .getCommentsInside(reportNode)
        .some(
          (comment) =>
            comment.range[0] < hrefCall.range[0] ||
            comment.range[1] > hrefCall.range[1],
        );
      if (hasOutsideComments) return null;
      const hashText = `hash: ${JSON.stringify(fragment)}`;
      return (fixer) => {
        const edits: TSESLint.RuleFix[] = [];
        if (!optionsArg) {
          edits.push(fixer.insertTextBefore(closingParen, `, { ${hashText} }`));
        } else if (firstProperty === undefined) {
          edits.push(fixer.replaceText(optionsArg, `{ ${hashText} }`));
        } else {
          // Inserting first keeps perfectionist-natural key order in the
          // common cases: hash sorts before params and search.
          edits.push(fixer.insertTextBefore(firstProperty, `${hashText}, `));
        }
        if (reportNode.range[0] < hrefCall.range[0]) {
          edits.push(
            fixer.removeRange([reportNode.range[0], hrefCall.range[0]]),
          );
        }
        if (hrefCall.range[1] < reportNode.range[1]) {
          edits.push(
            fixer.removeRange([hrefCall.range[1], reportNode.range[1]]),
          );
        }
        return edits;
      };
    }

    /**
     * Classifies the appended content and reports. `suffix` is the static
     * string appended directly after the href-ending operand, when there is
     * exactly one such trailing piece; `hrefCall` is non-null only when the
     * whole reported expression is exactly the call plus that suffix — the
     * only shape the fixer rewrites.
     */
    function reportConcat(
      reportNode: TSESTree.Node,
      suffix: null | string,
      hrefCall: null | TSESTree.CallExpression,
    ): void {
      if (
        suffix !== null &&
        suffix.startsWith("#") &&
        suffix.length > 1 &&
        !suffix.includes("?")
      ) {
        context.report({
          data: { suffix },
          fix: hrefCall ? buildHashFix(reportNode, hrefCall, suffix) : null,
          messageId: "hrefHashConcat",
          node: reportNode,
        });
        return;
      }
      if (suffix?.startsWith("?")) {
        context.report({
          data: { suffix },
          messageId: "hrefSearchConcat",
          node: reportNode,
        });
        return;
      }
      context.report({ messageId: "hrefConcat", node: reportNode });
    }

    return {
      BinaryExpression(node) {
        if (node.operator !== "+") return;
        // Topmost-only: nested `+` chains are handled once at the top.
        if (
          node.parent.type === AST_NODE_TYPES.BinaryExpression &&
          node.parent.operator === "+"
        )
          return;
        const operands = flattenPlusChain(node);
        let index = -1;
        for (let i = operands.length - 2; i >= 0; i--) {
          const operand = operands[i];
          if (operand !== undefined && endsWithHrefCall(operand)) {
            index = i;
            break;
          }
        }
        if (index === -1) return;
        const last = operands[operands.length - 1];
        const suffix =
          index === operands.length - 2 && last !== undefined
            ? getStaticPath(last)
            : null;
        const head = operands[index];
        const hrefCall =
          operands.length === 2 && head !== undefined && isHrefCall(head)
            ? head
            : null;
        reportConcat(node, suffix, hrefCall);
      },
      TemplateLiteral(node) {
        // Tagged templates have unknown semantics (sql`…`, css`…`) — skip.
        if (node.parent.type === AST_NODE_TYPES.TaggedTemplateExpression)
          return;
        let index = -1;
        for (let i = node.expressions.length - 1; i >= 0; i--) {
          const expression = node.expressions[i];
          if (expression !== undefined && endsWithHrefCall(expression)) {
            index = i;
            break;
          }
        }
        if (index === -1) return;
        const trailingExpressions = node.expressions.length - 1 - index;
        const hasTrailingText = node.quasis
          .slice(index + 1)
          .some((quasi) => quasi.value.cooked !== "");
        if (trailingExpressions === 0 && !hasTrailingText) return;
        const suffix =
          trailingExpressions === 0
            ? (node.quasis[index + 1]?.value.cooked ?? null)
            : null;
        const only = node.expressions[0];
        const hrefCall =
          node.expressions.length === 1 &&
          only !== undefined &&
          node.quasis[0]?.value.cooked === "" &&
          isHrefCall(only)
            ? only
            : null;
        reportConcat(node, suffix, hrefCall);
      },
    };
  },
  defaultOptions: [],
  meta: {
    docs: {
      description:
        "Disallow appending strings to paramour's href() results; pass search and hash through href()'s options instead",
    },
    fixable: "code",
    messages: {
      hrefConcat: `Appending content to an href() result bypasses paramour's route validation and serialization. Pass it through href()'s options ({ params, search, hash }) instead — ${DOCS_URL}`,
      hrefHashConcat: `Appending "{{suffix}}" to an href() result bypasses paramour's route validation. Pass it as href()'s hash option instead — ${DOCS_URL}`,
      hrefSearchConcat: `Appending "{{suffix}}" to an href() result bypasses paramour's serialization. Declare the params in the route's search codecs and pass them through href()'s search option instead — ${DOCS_URL}`,
    },
    schema: [],
    type: "suggestion",
  },
  name: "no-href-arithmetic",
});
