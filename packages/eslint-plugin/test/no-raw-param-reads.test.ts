import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import { noRawParamReads } from "../src/rules/no-raw-param-reads.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-raw-param-reads", noRawParamReads, {
  invalid: [
    // Surface 1: App Router hooks
    {
      code: `import { useSearchParams } from "next/navigation";
export function C() {
  const params = useSearchParams();
  return params.get("q");
}`,
      errors: [
        {
          data: { hook: "useSearchParams", replacement: "useSearch" },
          messageId: "rawParamsHook",
        },
      ],
    },
    {
      code: `import { useParams } from "next/navigation";
export function C() {
  const params = useParams();
  return params.id;
}`,
      errors: [
        {
          data: { hook: "useParams", replacement: "useRouteParams" },
          messageId: "rawParamsHook",
        },
      ],
    },
    // Aliased import reports the canonical imported name
    {
      code: `import { useParams as useP } from "next/navigation";
export const params = useP();`,
      errors: [
        {
          data: { hook: "useParams", replacement: "useRouteParams" },
          messageId: "rawParamsHook",
        },
      ],
    },
    // Namespace form
    {
      code: `import * as nav from "next/navigation";
export const params = nav.useSearchParams();`,
      errors: [
        {
          data: { hook: "useSearchParams", replacement: "useSearch" },
          messageId: "rawParamsHook",
        },
      ],
    },
    // Extensionful nodenext spelling
    {
      code: `import { useParams } from "next/navigation.js";
export const params = useParams();`,
      errors: [
        {
          data: { hook: "useParams", replacement: "useRouteParams" },
          messageId: "rawParamsHook",
        },
      ],
    },
    // Surface 2: router.query, variable form
    {
      code: `import { useRouter } from "next/router";
export function C() {
  const router = useRouter();
  return router.query.id;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    {
      code: `import { useRouter } from "next/router.js";
export function C() {
  const router = useRouter();
  return router.query.id;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    // Direct call form
    {
      code: `import { useRouter } from "next/router";
export function C() {
  return useRouter().query;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    // Aliased useRouter
    {
      code: `import { useRouter as useR } from "next/router";
export function C() {
  const r = useR();
  return r.query;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    // Namespace-qualified useRouter()
    {
      code: `import * as R from "next/router";
export function C() {
  const router = R.useRouter();
  return router.query;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    // Surface 2, destructured forms — reported on the pattern property
    {
      code: `import { useRouter } from "next/router";
export function C() {
  const { query } = useRouter();
  return query.id;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    {
      code: `import { useRouter } from "next/router";
export function C() {
  const { query: q } = useRouter();
  return q.id;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    {
      code: `import { useRouter } from "next/router";
export function C() {
  const { query: { id } } = useRouter();
  return id;
}`,
      errors: [{ messageId: "rawRouterQuery" }],
    },
    // Partial allow: unlisted surfaces still fire
    {
      code: `import { useSearchParams } from "next/navigation";
export const params = useSearchParams();`,
      errors: [
        {
          data: { hook: "useSearchParams", replacement: "useSearch" },
          messageId: "rawParamsHook",
        },
      ],
      options: [{ allow: ["useParams"] }],
    },
    // Multiple violations in one file, with report locations
    {
      code: `import { useParams } from "next/navigation";
import { useRouter } from "next/router";
export function C() {
  const params = useParams();
  const router = useRouter();
  return [params.id, router.query.id];
}`,
      errors: [
        {
          column: 18,
          data: { hook: "useParams", replacement: "useRouteParams" },
          line: 4,
          messageId: "rawParamsHook",
        },
        {
          column: 22,
          line: 6,
          messageId: "rawRouterQuery",
        },
      ],
    },
  ],
  valid: [
    // Same-name hooks from other modules — the headline non-goal
    `import { useParams } from "react-router-dom";
export const params = useParams();`,
    `import { useSearchParams } from "react-router-dom";
export const params = useSearchParams();`,
    // Locally defined and shadowed names never fire
    `function useParams() { return {}; }
export const params = useParams();`,
    `import { useParams } from "next/navigation";
export function C() {
  const useParams = () => ({});
  return useParams();
}`,
    // Type-only import — a value usage is already a TS error
    `import type { useParams } from "next/navigation";
export const params = useParams();`,
    // App Router useRouter() has no .query — the source check keeps this out
    `import { useRouter } from "next/navigation";
export function C() {
  const router = useRouter();
  return router.query;
}`,
    // Writes are no-raw-hrefs' surface, not this rule's
    `import { useRouter } from "next/router";
export function go() {
  const router = useRouter();
  router.push("/a");
}`,
    // Other destructured keys are untyped-read-free
    `import { useRouter } from "next/router";
export function C() {
  const { pathname } = useRouter();
  return pathname;
}`,
    // Computed access — out of scope for a syntactic rule
    `import { useRouter } from "next/router";
export function C() {
  const router = useRouter();
  return router["query"];
}`,
    // query-shaped members on non-routers
    `declare const db: { query: (sql: string) => unknown };
export const rows = db.query("select 1");`,
    // Namespace import of another module
    `import * as nav from "./params";
export const params = nav.useParams();`,
    // A router crossing a function boundary escapes detection — accepted
    // cost of staying syntactic
    `import type { NextRouter } from "next/router";
export function read(router: NextRouter) {
  return router.query;
}`,
    // allow silences each surface
    {
      code: `import { useSearchParams } from "next/navigation";
export const params = useSearchParams();`,
      options: [{ allow: ["useSearchParams"] }],
    },
    {
      code: `import { useParams } from "next/navigation";
export const params = useParams();`,
      options: [{ allow: ["useParams"] }],
    },
    {
      code: `import { useRouter } from "next/router";
export function C() {
  const router = useRouter();
  const { query } = useRouter();
  return [router.query, query];
}`,
      options: [{ allow: ["routerQuery"] }],
    },
  ],
});
