import type { TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule, DOCS_URL } from "../utils/create-rule.js";
import {
  getImportedCallee,
  isImportedCall,
  resolveDef,
  sourceMatches,
} from "../utils/imports.js";

type AllowEntry = "routerQuery" | "useParams" | "useSearchParams";
type MessageIds = "rawParamsHook" | "rawRouterQuery";
type Options = [{ allow?: AllowEntry[] }];

// Each raw App Router hook mapped to its like-for-like paramour replacement;
// both names are interpolated into the message.
const APP_HOOK_REPLACEMENTS = new Map([
  ["useParams", "useRouteParams"],
  ["useSearchParams", "useSearch"],
]);

// Bare and extensionful spellings — nodenext-resolution users import
// "next/router.js".
const PAGES_ROUTER_SOURCES = ["next/router", "next/router.js"];

export const noRawParamReads = createRule<Options, MessageIds>({
  create(context, [options]) {
    // Widened to string so unfiltered binding names can be probed directly.
    const allow: ReadonlySet<string> = new Set(options.allow ?? []);
    const { sourceCode } = context;

    function isPagesUseRouterCall(
      node: null | TSESTree.Expression | undefined,
    ): boolean {
      return isImportedCall(
        sourceCode,
        node,
        "useRouter",
        PAGES_ROUTER_SOURCES,
      );
    }

    return {
      // Surface 1: useParams() / useSearchParams() from next/navigation. The
      // call compiles and renders, but the route's codecs never run.
      CallExpression(node) {
        const binding = getImportedCallee(sourceCode, node);
        if (!binding || !sourceMatches(binding.source, "next/navigation"))
          return;
        const replacement = APP_HOOK_REPLACEMENTS.get(binding.imported);
        if (replacement === undefined) return;
        if (allow.has(binding.imported)) return;
        context.report({
          data: { hook: binding.imported, replacement },
          messageId: "rawParamsHook",
          node,
        });
      },
      // Surface 2: router.query on a next/router useRouter() router — the
      // variable form and the direct useRouter().query form. A router passed
      // across function boundaries or through props escapes detection —
      // accepted cost of staying syntactic.
      MemberExpression(node) {
        if (allow.has("routerQuery")) return;
        if (
          node.computed ||
          node.property.type !== AST_NODE_TYPES.Identifier ||
          node.property.name !== "query"
        )
          return;
        const { object } = node;
        if (object.type === AST_NODE_TYPES.CallExpression) {
          if (!isPagesUseRouterCall(object)) return;
          context.report({ messageId: "rawRouterQuery", node });
          return;
        }
        if (object.type !== AST_NODE_TYPES.Identifier) return;
        const def = resolveDef(sourceCode, object, object.name);
        if (def?.node.type !== AST_NODE_TYPES.VariableDeclarator) return;
        if (def.node.id.type !== AST_NODE_TYPES.Identifier) return;
        if (!isPagesUseRouterCall(def.node.init)) return;
        context.report({ messageId: "rawRouterQuery", node });
      },
      // Surface 2, destructured form: const { query } = useRouter(). Reported
      // once on the pattern property — a destructured read has no later call
      // site to anchor to, and flagging every reference of the local would
      // multiply noise without adding information. Matched on the pattern
      // *key*, so const { query: q } and const { query: { id } } fire too.
      VariableDeclarator(node) {
        if (allow.has("routerQuery")) return;
        if (node.id.type !== AST_NODE_TYPES.ObjectPattern) return;
        if (!isPagesUseRouterCall(node.init)) return;
        for (const property of node.id.properties) {
          if (
            property.type !== AST_NODE_TYPES.Property ||
            property.computed ||
            property.key.type !== AST_NODE_TYPES.Identifier ||
            property.key.name !== "query"
          )
            continue;
          context.report({ messageId: "rawRouterQuery", node: property });
        }
      },
    };
  },
  defaultOptions: [{ allow: [] }],
  meta: {
    docs: {
      description:
        "Disallow raw Next.js param and search reads that bypass paramour's codecs; use the typed hooks from @paramour-js/next instead",
    },
    messages: {
      rawParamsHook: `{{hook}}() bypasses paramour's route validation. Use {{replacement}}(route) from "@paramour-js/next/app" instead — ${DOCS_URL}`,
      rawRouterQuery: `router.query bypasses paramour's route validation. Use useRouteParams(route) and useSearch(route) from "@paramour-js/next/pages" instead — ${DOCS_URL}`,
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allow: {
            items: {
              enum: ["routerQuery", "useParams", "useSearchParams"],
              type: "string",
            },
            type: "array",
          },
        },
        type: "object",
      },
    ],
    type: "suggestion",
  },
  name: "no-raw-param-reads",
});
