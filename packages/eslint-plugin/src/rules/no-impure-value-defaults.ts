import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule, DOCS_URL } from "../utils/create-rule.js";
import { getImportBinding, resolveDef } from "../utils/imports.js";

type MessageIds = "impureCatch" | "impureDefault" | "useFactory";
type Options = [];

// Known-impure member calls, keyed by global object. A fixed allowlist, not a
// purity analysis: every entry returns a different value on every call, so a
// value-form default built from one is always a frozen snapshot. `Temporal`
// is handled separately (any `Temporal.Now.*()` call).
const IMPURE_MEMBER_CALLS = new Map([
  ["crypto", new Set(["getRandomValues", "randomUUID"])],
  ["Date", new Set(["now"])],
  ["Math", new Set(["random"])],
  ["performance", new Set(["now"])],
]);

const NODE_CRYPTO_SOURCES = new Set(["crypto", "node:crypto"]);

// Nested function bodies are skipped: a function inside the argument is not
// evaluated at definition time (and the argument itself being a function is
// already the factory form).
const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

export const noImpureValueDefaults = createRule<Options, MessageIds>({
  create(context) {
    const { sourceCode } = context;

    /**
     * True when `name` at `node` refers to the global (no local or imported
     * binding shadows it). `crypto` also counts when it is the default or
     * namespace import of node's crypto module — same API, same impurity.
     */
    function isGlobalLike(node: TSESTree.Node, name: string): boolean {
      const def = resolveDef(sourceCode, node, name);
      if (def === undefined) return true;
      if (name !== "crypto") return false;
      const binding = getImportBinding(def);
      return (
        binding !== null &&
        (binding.imported === "default" || binding.imported === "*") &&
        NODE_CRYPTO_SOURCES.has(binding.source)
      );
    }

    function isImpure(node: TSESTree.Node): boolean {
      // new Date() with no arguments — `new Date(x)` is a pure conversion.
      if (
        node.type === AST_NODE_TYPES.NewExpression &&
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === "Date"
      ) {
        return node.arguments.length === 0 && isGlobalLike(node, "Date");
      }
      if (node.type !== AST_NODE_TYPES.CallExpression) return false;
      const { callee } = node;
      // Date() called without `new` returns the current time as a string.
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return callee.name === "Date" && isGlobalLike(node, "Date");
      }
      if (
        callee.type !== AST_NODE_TYPES.MemberExpression ||
        callee.computed ||
        callee.property.type !== AST_NODE_TYPES.Identifier
      )
        return false;
      const { object } = callee;
      if (object.type === AST_NODE_TYPES.Identifier) {
        const methods = IMPURE_MEMBER_CALLS.get(object.name);
        return (
          methods?.has(callee.property.name) === true &&
          isGlobalLike(node, object.name)
        );
      }
      // Temporal.Now.<anything>() — every Now method reads the clock.
      return (
        object.type === AST_NODE_TYPES.MemberExpression &&
        !object.computed &&
        object.object.type === AST_NODE_TYPES.Identifier &&
        object.object.name === "Temporal" &&
        object.property.type === AST_NODE_TYPES.Identifier &&
        object.property.name === "Now" &&
        isGlobalLike(node, "Temporal")
      );
    }

    /** First impure sub-expression in source order, outside nested functions. */
    function findImpure(node: TSESTree.Node): null | TSESTree.Node {
      if (isImpure(node)) return node;
      if (FUNCTION_TYPES.has(node.type)) return null;
      for (const key of sourceCode.visitorKeys[node.type] ?? []) {
        const child = (node as unknown as Record<string, unknown>)[key];
        const children = Array.isArray(child) ? child : [child];
        for (const candidate of children) {
          if (
            candidate === null ||
            typeof candidate !== "object" ||
            !("type" in candidate)
          )
            continue;
          const found = findImpure(candidate as TSESTree.Node);
          if (found) return found;
        }
      }
      return null;
    }

    /**
     * True when the modifier call's receiver chain roots at a `p.<builder>()`
     * call, with `p` imported from paramour (named, aliased, or through a
     * namespace import as `ns.p`). Walks back through intermediate modifier
     * calls (`p.timestamp().catch(x).default(…)`), so unrelated builders with
     * their own `.default()`/`.catch()` never fire.
     */
    function isParamourCodecChain(receiver: TSESTree.Expression): boolean {
      let current: TSESTree.Node = receiver;
      while (
        current.type === AST_NODE_TYPES.CallExpression &&
        current.callee.type === AST_NODE_TYPES.MemberExpression &&
        !current.callee.computed
      ) {
        const object: TSESTree.Expression = current.callee.object;
        if (object.type === AST_NODE_TYPES.Identifier) {
          const binding = getImportBinding(
            resolveDef(sourceCode, object, object.name),
          );
          if (binding?.imported === "p" && binding.source === "paramour")
            return true;
        }
        if (
          object.type === AST_NODE_TYPES.MemberExpression &&
          !object.computed &&
          object.object.type === AST_NODE_TYPES.Identifier &&
          object.property.type === AST_NODE_TYPES.Identifier &&
          object.property.name === "p"
        ) {
          const binding = getImportBinding(
            resolveDef(sourceCode, object.object, object.object.name),
          );
          if (binding?.imported === "*" && binding.source === "paramour")
            return true;
        }
        current = object;
      }
      return false;
    }

    function buildFactoryFix(
      argument: TSESTree.Expression,
    ): TSESLint.ReportFixFunction {
      const text = sourceCode.getText(argument);
      // An object-literal body would parse as a block without parentheses.
      const body =
        argument.type === AST_NODE_TYPES.ObjectExpression ? `(${text})` : text;
      return (fixer) => fixer.replaceText(argument, `() => ${body}`);
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier
        )
          return;
        const modifier = callee.property.name;
        if (modifier !== "default" && modifier !== "catch") return;
        const [argument] = node.arguments;
        if (
          node.arguments.length !== 1 ||
          argument === undefined ||
          argument.type === AST_NODE_TYPES.SpreadElement
        )
          return;
        const impure = findImpure(argument);
        if (!impure) return;
        if (!isParamourCodecChain(callee.object)) return;
        context.report({
          data: { impure: sourceCode.getText(impure) },
          messageId: modifier === "default" ? "impureDefault" : "impureCatch",
          node: argument,
          suggest: [
            { fix: buildFactoryFix(argument), messageId: "useFactory" },
          ],
        });
      },
    };
  },
  defaultOptions: [],
  meta: {
    docs: {
      description:
        "Disallow time-varying or random values in a codec's value-form .default()/.catch(); use the factory form instead",
    },
    hasSuggestions: true,
    messages: {
      impureCatch: `\`{{impure}}\` is evaluated once, when the module loads, so this .catch() fallback is frozen at that moment forever. Pass a factory instead — .catch(() => …) runs per decode — ${DOCS_URL}`,
      impureDefault: `\`{{impure}}\` is evaluated once, when the module loads, so this .default() is frozen at that moment forever — and value defaults drive URL elision, so links elide against the stale value. Pass a factory instead — .default(() => …) runs per decode — ${DOCS_URL}`,
      useFactory:
        "Wrap in a factory (note: factory defaults are never elided from URLs, and @paramour-js/nuqs types their keys as nullable)",
    },
    schema: [],
    type: "problem",
  },
  name: "no-impure-value-defaults",
});
