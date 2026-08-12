import type { TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule, DOCS_URL } from "../utils/create-rule.js";
import {
  getImportBinding,
  isImportedCall,
  resolveDef,
} from "../utils/imports.js";
import { getStaticPath } from "../utils/static-path.js";

type MessageIds = "rawHref" | "rawRedirect" | "rawRouterCall";
type Options = [{ ignorePaths?: string[] }];

const REDIRECT_FUNCTIONS = new Set(["permanentRedirect", "redirect"]);
const ROUTER_METHODS = new Set(["prefetch", "push", "replace"]);

/**
 * Boundary-aware prefix match: "/legacy" exempts "/legacy", "/legacy/old",
 * "/legacy?tab=1", "/legacy#top" — but not "/legacybar". A trailing slash on
 * the configured prefix is ignored; "/" (→ "") exempts every path.
 */
function isIgnored(path: string, ignorePaths: readonly string[]): boolean {
  return ignorePaths.some((raw) => {
    const prefix = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    if (path === prefix) return true;
    if (!path.startsWith(prefix)) return false;
    const boundary = path.charAt(prefix.length);
    return boundary === "#" || boundary === "/" || boundary === "?";
  });
}

/**
 * Flags any literal starting with "/"; everything else (external URLs,
 * "#hash", "mailto:", relative paths, "") is exempt by not starting with "/".
 * "//host/path" is protocol-relative — an external URL, so also exempt.
 */
function isRawInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export const noRawHrefs = createRule<Options, MessageIds>({
  create(context, [options]) {
    const ignorePaths = options.ignorePaths ?? [];
    const { sourceCode } = context;

    function isUseRouterCall(node: null | TSESTree.Expression): boolean {
      return isImportedCall(sourceCode, node, "useRouter", ["next/navigation"]);
    }

    function checkPath(
      expression: TSESTree.Node,
      reportNode: TSESTree.Node,
      messageId: MessageIds,
      data: Record<string, string>,
    ): void {
      const path = getStaticPath(expression);
      if (
        path === null ||
        !isRawInternalPath(path) ||
        isIgnored(path, ignorePaths)
      )
        return;
      context.report({ data: { ...data, path }, messageId, node: reportNode });
    }

    function checkPathArgument(
      argument: TSESTree.CallExpressionArgument | undefined,
      messageId: MessageIds,
      data: Record<string, string>,
    ): void {
      if (!argument) return;
      checkPath(argument, argument, messageId, data);
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          if (
            callee.computed ||
            callee.property.type !== AST_NODE_TYPES.Identifier
          )
            return;
          const method = callee.property.name;
          if (!REDIRECT_FUNCTIONS.has(method) && !ROUTER_METHODS.has(method))
            return;
          if (callee.object.type !== AST_NODE_TYPES.Identifier) return;
          const def = resolveDef(sourceCode, callee.object, callee.object.name);
          const binding = getImportBinding(def);
          if (binding) {
            // Surface 3, namespace form: import * as nav from
            // "next/navigation"; nav.redirect("/x").
            if (
              binding.imported !== "*" ||
              binding.source !== "next/navigation" ||
              !REDIRECT_FUNCTIONS.has(method)
            )
              return;
            checkPathArgument(node.arguments[0], "rawRedirect", {
              callee: method,
            });
            return;
          }
          // Surface 2: router.push/replace/prefetch on a variable initialized
          // from useRouter(). A router passed across function boundaries or
          // through props escapes detection — accepted cost of staying
          // syntactic.
          if (!ROUTER_METHODS.has(method)) return;
          if (def?.node.type !== AST_NODE_TYPES.VariableDeclarator) return;
          if (def.node.id.type !== AST_NODE_TYPES.Identifier) return;
          if (!isUseRouterCall(def.node.init)) return;
          checkPathArgument(node.arguments[0], "rawRouterCall", {
            method,
          });
          return;
        }
        if (callee.type !== AST_NODE_TYPES.Identifier) return;
        const def = resolveDef(sourceCode, callee, callee.name);
        if (!def) return;
        const binding = getImportBinding(def);
        if (binding) {
          // Surface 3: redirect/permanentRedirect from next/navigation.
          if (
            binding.source !== "next/navigation" ||
            !REDIRECT_FUNCTIONS.has(binding.imported)
          ) {
            return;
          }
          checkPathArgument(node.arguments[0], "rawRedirect", {
            callee: binding.imported,
          });
          return;
        }
        // Surface 2, destructured form: const { push } = useRouter(). Matched
        // on the pattern *key*, so const { push: go } = useRouter() fires too.
        if (def.node.type !== AST_NODE_TYPES.VariableDeclarator) return;
        if (def.node.id.type !== AST_NODE_TYPES.ObjectPattern) return;
        if (!isUseRouterCall(def.node.init)) return;
        const property = def.name.parent;
        if (property.type !== AST_NODE_TYPES.Property || property.computed)
          return;
        if (property.parent !== def.node.id) return;
        if (property.key.type !== AST_NODE_TYPES.Identifier) return;
        if (!ROUTER_METHODS.has(property.key.name)) return;
        checkPathArgument(node.arguments[0], "rawRouterCall", {
          method: property.key.name,
        });
      },
      JSXAttribute(node) {
        // Surface 1: href on Link imported (under any local name) from
        // next/link. Scope resolution, not name matching — a component that
        // happens to be called Link but comes from elsewhere never fires.
        if (
          node.name.type !== AST_NODE_TYPES.JSXIdentifier ||
          node.name.name !== "href"
        )
          return;
        const elementName = node.parent.name;
        if (elementName.type !== AST_NODE_TYPES.JSXIdentifier) return;
        // Lowercase-initial JSX names are intrinsic elements (<a>, <link>) no
        // matter what is in scope — skip them before paying for scope
        // resolution; hrefs on intrinsics dominate real JSX.
        if (/^[a-z]/.test(elementName.name)) return;
        const binding = getImportBinding(
          resolveDef(sourceCode, node, elementName.name),
        );
        if (binding?.imported !== "default" || binding.source !== "next/link")
          return;
        const { value } = node;
        if (!value) return;
        const expression =
          value.type === AST_NODE_TYPES.JSXExpressionContainer
            ? value.expression
            : value;
        checkPath(expression, value, "rawHref", {});
      },
    };
  },
  defaultOptions: [{ ignorePaths: [] }],
  meta: {
    docs: {
      description:
        "Disallow raw string paths in Next.js navigation APIs; build hrefs with paramour's typed href() instead",
    },
    messages: {
      rawHref: `Raw string href "{{path}}" bypasses paramour's route validation. Build it with href(route, …) instead — ${DOCS_URL}`,
      rawRedirect: `{{callee}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass an href(route, …) result instead — ${DOCS_URL}`,
      rawRouterCall: `router.{{method}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass an href(route, …) result instead — ${DOCS_URL}`,
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          ignorePaths: {
            // minLength guards against a stray "" entry, which would exempt
            // every path; the sanctioned exempt-all spelling is "/".
            items: { minLength: 1, type: "string" },
            type: "array",
          },
        },
        type: "object",
      },
    ],
    type: "suggestion",
  },
  name: "no-raw-hrefs",
});
