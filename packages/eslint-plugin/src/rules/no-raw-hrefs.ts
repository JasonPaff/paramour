import type { TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule, DOCS_URL } from "../utils/create-rule.js";
import {
  getImportBinding,
  isImportedCall,
  resolveDef,
  sourceMatches,
} from "../utils/imports.js";
import { getStaticPath } from "../utils/static-path.js";

export interface LinkComponent {
  name: string;
  prop?: string;
  source: string;
}

type MessageIds =
  | "rawFormAction"
  | "rawHref"
  | "rawNextResponse"
  | "rawRedirect"
  | "rawRouterCall"
  | "rawUrlObject";

type Options = [{ ignorePaths?: string[]; linkComponents?: LinkComponent[] }];

// isImportedCall matches sources by exact list membership, so the
// extensionful nodenext spellings are listed explicitly; direct binding
// comparisons use sourceMatches instead.
const APP_ROUTER_SOURCES = ["next/navigation", "next/navigation.js"];
const PAGES_ROUTER_SOURCES = ["next/router", "next/router.js"];
const USE_ROUTER_SOURCES = [...APP_ROUTER_SOURCES, ...PAGES_ROUTER_SOURCES];

const REDIRECT_FUNCTIONS = new Set(["permanentRedirect", "redirect"]);
const RESPONSE_METHODS = new Set(["redirect", "rewrite"]);
const ROUTER_METHODS = new Set(["prefetch", "push", "replace"]);

// Node's URL re-export; the bare global is recognized by being unresolved.
const URL_SOURCES = new Set(["node:url", "url"]);

/**
 * Finds the `pathname` property of a UrlObject literal: the first
 * non-computed property keyed `pathname` (identifier or string key). A
 * computed key or a pathname arriving via spread is dynamic — out of scope.
 */
function getUrlObjectPathname(node: TSESTree.Node): null | TSESTree.Property {
  if (node.type !== AST_NODE_TYPES.ObjectExpression) return null;
  for (const property of node.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed)
      continue;
    const { key } = property;
    // A non-computed key is an Identifier or a Literal; a string Literal key
    // ({ "pathname": … }) counts, a numeric one cannot name pathname.
    const name =
      key.type === AST_NODE_TYPES.Identifier
        ? key.name
        : typeof key.value === "string"
          ? key.value
          : null;
    if (name === "pathname") return property;
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
 * Always exempt, on top of `ignorePaths`. Links to route handlers can't be
 * built with href(): the registry lists only pages, so a warning there has
 * no fix. `/api` is the Pages Router's reserved API directory and the App
 * Router convention for route handlers. A page under /api goes unflagged,
 * which is the accepted cost.
 */
const ROUTE_HANDLER_PREFIX = "/api";

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
    const ignorePaths = [ROUTE_HANDLER_PREFIX, ...(options.ignorePaths ?? [])];
    const linkComponents = options.linkComponents ?? [];
    const { sourceCode } = context;

    function isUseRouterCall(node: null | TSESTree.Expression): boolean {
      return isImportedCall(sourceCode, node, "useRouter", USE_ROUTER_SOURCES);
    }

    /**
     * True for the URL constructor: the bare global (unresolved in scope, so
     * a local shadow correctly skips) or the node:url re-export. This is the
     * one place the rule matches a global name rather than an import.
     */
    function isUrlConstructor(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.Identifier || node.name !== "URL")
        return false;
      const def = resolveDef(sourceCode, node, node.name);
      if (!def) return true;
      const binding = getImportBinding(def);
      return binding?.imported === "URL" && URL_SOURCES.has(binding.source);
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

    // The pathname value goes through the same funnel as a string href, so
    // ignorePaths applies to it identically; the report lands on the
    // pathname property, keeping the squiggle on the offending part of a
    // possibly large object.
    function checkUrlObject(expression: TSESTree.Node): void {
      const property = getUrlObjectPathname(expression);
      if (!property) return;
      checkPath(property.value, property, "rawUrlObject", {});
    }

    // String and UrlObject funnels are mutually exclusive by node type, so
    // this can never double-report one value.
    function checkHref(
      expression: TSESTree.Node,
      reportNode: TSESTree.Node,
      messageId: MessageIds,
      data: Record<string, string>,
    ): void {
      checkPath(expression, reportNode, messageId, data);
      checkUrlObject(expression);
    }

    function checkHrefArgument(
      argument: TSESTree.CallExpressionArgument | undefined,
      messageId: MessageIds,
      data: Record<string, string>,
    ): void {
      if (!argument) return;
      checkHref(argument, argument, messageId, data);
    }

    // Surface 6, inline-URL form: NextResponse.redirect(new URL("/x", base)).
    // Reported on the inner path literal. A URL value built outside the call
    // escapes detection — accepted cost of staying syntactic.
    function checkNewUrlArgument(
      argument: TSESTree.CallExpressionArgument,
      messageId: MessageIds,
      data: Record<string, string>,
    ): void {
      if (argument.type !== AST_NODE_TYPES.NewExpression) return;
      if (!isUrlConstructor(argument.callee)) return;
      const urlArgument = argument.arguments[0];
      if (!urlArgument) return;
      checkPath(urlArgument, urlArgument, messageId, data);
    }

    // JSX props checked per element: the built-in surfaces plus one entry
    // per configured linkComponents wrapper. Matching is on the *imported*
    // name (getImportBinding normalizes aliases; "default" names a default
    // import), so wrapper configs are alias-proof like every other surface.
    interface PropTarget {
      imported: string;
      messageId: MessageIds;
      source: string;
      urlObject: boolean;
    }
    const propTargets = new Map<string, PropTarget[]>();
    function addPropTarget(prop: string, target: PropTarget): void {
      const targets = propTargets.get(prop);
      if (targets) targets.push(target);
      else propTargets.set(prop, [target]);
    }
    // Surface 1: Link href — the UrlObject form counts.
    addPropTarget("href", {
      imported: "default",
      messageId: "rawHref",
      source: "next/link",
      urlObject: true,
    });
    // Surface 5: Form action — string actions only; a function value
    // (server action) is not a path, and the UrlObject form is not accepted
    // by next/form.
    addPropTarget("action", {
      imported: "default",
      messageId: "rawFormAction",
      source: "next/form",
      urlObject: false,
    });
    for (const component of linkComponents) {
      addPropTarget(component.prop ?? "href", {
        imported: component.name,
        messageId: "rawHref",
        source: component.source,
        urlObject: true,
      });
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
          if (
            !REDIRECT_FUNCTIONS.has(method) &&
            !RESPONSE_METHODS.has(method) &&
            !ROUTER_METHODS.has(method)
          )
            return;
          if (callee.object.type !== AST_NODE_TYPES.Identifier) return;
          const def = resolveDef(sourceCode, callee.object, callee.object.name);
          const binding = getImportBinding(def);
          if (binding) {
            // Surface 4, namespace form: import * as nav from
            // "next/navigation"; nav.redirect("/x").
            if (
              binding.imported === "*" &&
              sourceMatches(binding.source, "next/navigation") &&
              REDIRECT_FUNCTIONS.has(method)
            ) {
              checkPathArgument(node.arguments[0], "rawRedirect", {
                callee: method,
              });
              return;
            }
            // Surface 3: the static Router form — import Router from
            // "next/router"; Router.push("/x").
            if (
              binding.imported === "default" &&
              sourceMatches(binding.source, "next/router") &&
              ROUTER_METHODS.has(method)
            ) {
              checkHrefArgument(node.arguments[0], "rawRouterCall", {
                method,
              });
              return;
            }
            // Surface 6: NextResponse.redirect/rewrite from next/server.
            // Only the raw-internal-path string counts — absolute URLs and
            // URL-typed variables are what these APIs require and stay
            // exempt. The nested namespace form (ns.NextResponse.redirect)
            // has a MemberExpression object and is skipped above — accepted
            // false negative.
            if (
              binding.imported === "NextResponse" &&
              sourceMatches(binding.source, "next/server") &&
              RESPONSE_METHODS.has(method)
            ) {
              const argument = node.arguments[0];
              if (!argument) return;
              checkPath(argument, argument, "rawNextResponse", { method });
              checkNewUrlArgument(argument, "rawNextResponse", { method });
            }
            return;
          }
          // Surface 2: router.push/replace/prefetch on a variable
          // initialized from useRouter() — either router. A router passed
          // across function boundaries or through props escapes detection —
          // accepted cost of staying syntactic.
          if (!ROUTER_METHODS.has(method)) return;
          if (def?.node.type !== AST_NODE_TYPES.VariableDeclarator) return;
          if (def.node.id.type !== AST_NODE_TYPES.Identifier) return;
          if (!isUseRouterCall(def.node.init)) return;
          checkHrefArgument(node.arguments[0], "rawRouterCall", {
            method,
          });
          return;
        }
        if (callee.type !== AST_NODE_TYPES.Identifier) return;
        const def = resolveDef(sourceCode, callee, callee.name);
        if (!def) return;
        const binding = getImportBinding(def);
        if (binding) {
          // Surface 4: redirect/permanentRedirect from next/navigation.
          if (
            !sourceMatches(binding.source, "next/navigation") ||
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
        checkHrefArgument(node.arguments[0], "rawRouterCall", {
          method: property.key.name,
        });
      },
      JSXAttribute(node) {
        // Surfaces 1 and 5, plus linkComponents wrappers. Scope resolution,
        // not name matching — a component that happens to be called Link but
        // comes from elsewhere never fires. Member-expression element names
        // (<UI.Link>) are out of scope.
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        const targets = propTargets.get(node.name.name);
        if (!targets) return;
        const elementName = node.parent.name;
        if (elementName.type !== AST_NODE_TYPES.JSXIdentifier) return;
        // Lowercase-initial JSX names are intrinsic elements (<a>, <form>) no
        // matter what is in scope — skip them before paying for scope
        // resolution; hrefs on intrinsics dominate real JSX.
        if (/^[a-z]/.test(elementName.name)) return;
        const binding = getImportBinding(
          resolveDef(sourceCode, node, elementName.name),
        );
        if (!binding) return;
        // find, not filter: a linkComponents entry duplicating a built-in
        // surface must not double-report.
        const target = targets.find(
          (candidate) =>
            binding.imported === candidate.imported &&
            sourceMatches(binding.source, candidate.source),
        );
        if (!target) return;
        const { value } = node;
        if (!value) return;
        const expression =
          value.type === AST_NODE_TYPES.JSXExpressionContainer
            ? value.expression
            : value;
        if (target.urlObject) {
          checkHref(expression, value, target.messageId, {});
        } else {
          checkPath(expression, value, target.messageId, {});
        }
      },
    };
  },
  defaultOptions: [{ ignorePaths: [], linkComponents: [] }],
  meta: {
    docs: {
      description:
        "Disallow raw string paths in Next.js navigation APIs; build hrefs with paramour's typed href() instead",
    },
    messages: {
      rawFormAction: `Raw string action "{{path}}" bypasses paramour's route validation. Build it with href(route, …) instead — ${DOCS_URL}`,
      rawHref: `Raw string href "{{path}}" bypasses paramour's route validation. Build it with href(route, …) instead — ${DOCS_URL}`,
      rawNextResponse: `NextResponse.{{method}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass new URL(href(route, …), request.url) instead — ${DOCS_URL}`,
      rawRedirect: `{{callee}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass an href(route, …) result instead — ${DOCS_URL}`,
      rawRouterCall: `router.{{method}}() called with raw path "{{path}}" bypasses paramour's route validation. Pass an href(route, …) result instead — ${DOCS_URL}`,
      rawUrlObject: `UrlObject with raw pathname "{{path}}" bypasses paramour's route validation. Build the URL with href(route, …) instead — ${DOCS_URL}`,
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
          linkComponents: {
            items: {
              additionalProperties: false,
              properties: {
                // name is the *imported* name ("default" for a default
                // export), never the local alias. minLength guards stray ""
                // entries: an empty name/source never matches anything, and
                // an empty prop would silently disable the entry.
                name: { minLength: 1, type: "string" },
                prop: { minLength: 1, type: "string" },
                source: { minLength: 1, type: "string" },
              },
              required: ["name", "source"],
              type: "object",
            },
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
