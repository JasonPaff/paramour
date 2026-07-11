/**
 * Type-level tests for the Pages-Router client hooks (design-06 PR3/PR5) —
 * the /pages twin of app-hooks.tst.ts. Pins the compile-time claims in
 * src/pages.ts that the runtime suite (pages.test.tsx) cannot express:
 *
 *  1. The `AnyPagesRoute` gate: both hooks constrain `R extends AnyPagesRoute`,
 *     so an app-branded route (from `defineAppRoute`) at either call site is a
 *     COMPILE ERROR — the mirror of app-hooks' pages-route rejection.
 *  2. The three-state `RouterResult` (PR5): the `pending` arm is in the union
 *     and forces narrowing — no `data` reachable without a status check — and
 *     the alias is literally `SafeResult<T> | { status: "pending" }` (PR12).
 *
 * Plain .ts (not .tsx): hooks are ordinary functions at the type level, no JSX.
 */
import { expect, test } from "tstyche";
import { defineAppRoute, definePagesRoute, p } from "paramour";
import type { InferRouteParams, SafeResult } from "paramour";

import { useRouteParams, useSearch } from "../src/pages.js";
import type { RouterResult } from "../src/pages.js";

// Mirrors the fixtures at the top of pages.test.tsx.
const pagesRoute = definePagesRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const appRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
});

test("AnyPagesRoute gate: an app-branded route is rejected at both call sites (PR3)", () => {
  expect(useRouteParams).type.not.toBeCallableWith(appRoute);
  expect(useSearch).type.not.toBeCallableWith(appRoute);
});

test("pages route is accepted and each hook returns its RouterResult (PR3/PR5)", () => {
  expect(useRouteParams).type.toBeCallableWith(pagesRoute);
  expect(useSearch).type.toBeCallableWith(pagesRoute);

  expect(useRouteParams(pagesRoute)).type.toBe<RouterResult<{ id: number }>>();
  expect(useRouteParams(pagesRoute)).type.toBe<
    RouterResult<InferRouteParams<typeof pagesRoute>>
  >();

  // Optional codecs keep the key PRESENT and add `| undefined` (design-02 D4).
  // Mutual assignability pins exact equality, same caveat as app-hooks.tst.ts:
  // tstyche's `toBe` treats the unexpanded InferSearchOutput mapped-type alias
  // as non-identical to the literal.
  const search = useSearch(pagesRoute);
  expect(search).type.toBeAssignableTo<
    RouterResult<{ page: number; q: string | undefined }>
  >();
  expect<
    RouterResult<{ page: number; q: string | undefined }>
  >().type.toBeAssignableTo<typeof search>();
});

test("select overloads project the RouterResult (design-07 SEL1/SEL2)", () => {
  // U is inferred from the selector; the pending arm stays in the union.
  expect(useSearch(pagesRoute, { select: (search) => search.page })).type.toBe<
    RouterResult<number>
  >();
  expect(
    useRouteParams(pagesRoute, { select: (params) => params.id }),
  ).type.toBe<RouterResult<number>>();

  // The selector's input is the decoded output type — no annotation needed.
  useSearch(pagesRoute, {
    select: (search) => {
      expect(search.page).type.toBe<number>();
      expect(search.q).type.toBe<string | undefined>();
      return search.page;
    },
  });

  // Same equality opt-in as the /app twin (SEL3).
  expect(useSearch).type.not.toBeCallableWith(pagesRoute, {
    equality: "deep",
    select: (search: { page: number; q: string | undefined }) => search.page,
  });
});

test("the pending arm is in the union and forces narrowing (PR5/PR6)", () => {
  // RouterResult<T> is literally SafeResult<T> | { status: "pending" } (PR12),
  // so both routers' results destructure identically.
  expect<RouterResult<{ id: number }>>().type.toBe<
    SafeResult<{ id: number }> | { status: "pending" }
  >();

  const result = useRouteParams(pagesRoute);
  expect(result.status).type.toBe<"error" | "pending" | "success">();
  // No `data` (or `error`) without a status check — the pending member has
  // neither, so unnarrowed access is a compile error. The check IS the feature.
  expect(result).type.not.toHaveProperty("data");
  expect(result).type.not.toHaveProperty("error");
  if (result.status === "success") {
    expect(result.data).type.toBe<{ id: number }>();
  }
});
