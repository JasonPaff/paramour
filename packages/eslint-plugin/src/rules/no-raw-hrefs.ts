import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

import {
  AST_NODE_TYPES,
  ASTUtils,
  ESLintUtils,
} from "@typescript-eslint/utils";

interface ImportBinding {
  imported: string;
  source: string;
}

type MessageIds = "rawHref" | "rawRedirect" | "rawRouterCall";
type Options = [{ ignorePaths?: string[] }];

const DOCS_URL = "https://paramour.dev/docs/reference/eslint-plugin";

const REDIRECT_FUNCTIONS = new Set(["permanentRedirect", "redirect"]);
const ROUTER_METHODS = new Set(["prefetch", "push", "replace"]);

const createRule = ESLintUtils.RuleCreator((name) => `${DOCS_URL}#${name}`);

/**
 * Resolves a variable definition to the import specifier it binds, if any.
 * Type-only imports are treated as no binding — a value usage of one is
 * already a TS error, and flagging it here would be noise on top.
 */
function getImportBinding(
  def: TSESLint.Scope.Definition | undefined,
): ImportBinding | null {
  if (!def) return null;
  const specifier = def.node;
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    if (specifier.parent.importKind === "type") return null;
    return { imported: "default", source: specifier.parent.source.value };
  }
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
    if (specifier.parent.importKind === "type") return null;
    return { imported: "*", source: specifier.parent.source.value };
  }
  if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
    if (specifier.parent.type !== AST_NODE_TYPES.ImportDeclaration) return null;
    if (
      specifier.importKind === "type" ||
      specifier.parent.importKind === "type"
    )
      return null;
    const { imported } = specifier;
    return {
      imported:
        imported.type === AST_NODE_TYPES.Identifier
          ? imported.name
          : imported.value,
      source: specifier.parent.source.value,
    };
  }
  return null;
}

/**
 * Extracts the string value of a static path expression: a string literal or
 * an expression-free template literal. Dynamic strings return null — out of
 * scope for v1 (LP3).
 */
function getStaticPath(node: TSESTree.Node): null | string {
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
 * LP5: flag any literal starting with "/"; everything else (external URLs,
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

    function resolveDef(
      node: TSESTree.Node,
      name: string,
    ): TSESLint.Scope.Definition | undefined {
      return ASTUtils.findVariable(sourceCode.getScope(node), name)?.defs[0];
    }

    function isUseRouterCall(node: null | TSESTree.Expression): boolean {
      if (node?.type !== AST_NODE_TYPES.CallExpression) return false;
      const { callee } = node;
      if (callee.type === AST_NODE_TYPES.Identifier) {
        const binding = getImportBinding(resolveDef(callee, callee.name));
        return (
          binding?.imported === "useRouter" &&
          binding.source === "next/navigation"
        );
      }
      // Namespace form: import * as nav from "next/navigation"; nav.useRouter()
      if (
        callee.type !== AST_NODE_TYPES.MemberExpression ||
        callee.computed ||
        callee.object.type !== AST_NODE_TYPES.Identifier ||
        callee.property.type !== AST_NODE_TYPES.Identifier ||
        callee.property.name !== "useRouter"
      )
        return false;
      const binding = getImportBinding(
        resolveDef(callee.object, callee.object.name),
      );
      return binding?.imported === "*" && binding.source === "next/navigation";
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
          const def = resolveDef(callee.object, callee.object.name);
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
          // syntactic (LP4).
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
        const def = resolveDef(callee, callee.name);
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
        const binding = getImportBinding(resolveDef(node, elementName.name));
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
      rawHref: `Raw string href "{{path}}" bypasses paramour's route validation. Build it with the route's href() instead — ${DOCS_URL}`,
      rawRedirect: `{{callee}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass the route's href() result instead — ${DOCS_URL}`,
      rawRouterCall: `router.{{method}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass the route's href() result instead — ${DOCS_URL}`,
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
