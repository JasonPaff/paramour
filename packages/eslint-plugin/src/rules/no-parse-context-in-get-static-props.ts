import type { TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule, DOCS_URL } from "../utils/create-rule.js";

type MessageIds = "parseContextInGetStaticProps";
type Options = [];

const PARSE_CONTEXT_METHODS = new Set(["parseContext", "safeParseContext"]);

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression;

/**
 * Finds the module-level `getStaticProps` function, exported or not — Next
 * only reads the exported one, but `function getStaticProps() {}` followed
 * by `export { getStaticProps }` is the same function, and the name alone is
 * a strong enough prior that requiring the export would only add misses.
 */
function findGetStaticProps(program: TSESTree.Program): FunctionNode | null {
  for (const statement of program.body) {
    const declaration =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration
        ? statement.declaration
        : statement;
    if (!declaration) continue;
    if (
      declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
      declaration.id?.name === "getStaticProps"
    )
      return declaration;
    if (declaration.type !== AST_NODE_TYPES.VariableDeclaration) continue;
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type !== AST_NODE_TYPES.Identifier ||
        declarator.id.name !== "getStaticProps" ||
        !declarator.init
      )
        continue;
      const init = unwrapTs(declarator.init);
      if (
        init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        init.type === AST_NODE_TYPES.FunctionExpression
      )
        return init;
    }
  }
  return null;
}

/** Strips TS-only wrappers: `(async () => {}) satisfies GetStaticProps`. */
function unwrapTs(node: TSESTree.Expression): TSESTree.Expression {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    current = current.expression;
  }
  return current;
}

export const noParseContextInGetStaticProps = createRule<Options, MessageIds>({
  create(context) {
    let target: FunctionNode | null = null;

    return {
      CallExpression(node) {
        if (!target) return;
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          !PARSE_CONTEXT_METHODS.has(callee.property.name)
        )
          return;
        // Lexical containment, nested helpers included: the call runs with
        // whatever context getStaticProps hands it.
        const [start, end] = target.range;
        if (node.range[0] < start || node.range[1] > end) return;
        context.report({
          data: {
            method: callee.property.name,
            replacement:
              callee.property.name === "safeParseContext"
                ? "safeDecodeParams"
                : "decodeParams",
          },
          messageId: "parseContextInGetStaticProps",
          node,
        });
      },
      Program(program) {
        // Program is visited before any CallExpression in it.
        target = findGetStaticProps(program);
      },
    };
  },
  defaultOptions: [],
  meta: {
    docs: {
      description:
        "Disallow route.parseContext()/safeParseContext() inside getStaticProps, whose context carries no query string",
    },
    messages: {
      parseContextInGetStaticProps: `getStaticProps contexts carry no query string, so {{method}}() always fails here. Decode just the path params instead: {{replacement}}(route, ctx.params ?? {}) from paramour — ${DOCS_URL}`,
    },
    schema: [],
    type: "problem",
  },
  name: "no-parse-context-in-get-static-props",
});
