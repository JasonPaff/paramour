/**
 * Type-level tests for the App-Router client hooks (design-06 PR3). Pins two
 * documented compile-time claims in src/app.ts that the runtime suite
 * (app.test.tsx) cannot express:
 *
 *  1. The `AnyAppRoute` gate: every hook constrains `R extends AnyAppRoute`, so
 *     a pages-branded route (from `definePagesRoute`) at any of the four call
 *     sites is a COMPILE ERROR — not a runtime surprise. Core's route-api.tst
 *     asserts raw `AnyAppRoute` assignability; these assertions pin the hook
 *     signatures themselves.
 *  2. The `as SearchOutputOf` cast in `useSearchOrThrow` (src/app.ts): a
 *     `rawSearch(schema)` route infers the SCHEMA's output here, not a garbage
 *     `{ "~kind", "~schema" }` marker shape.
 *
 * Plain .ts (not .tsx): hooks are ordinary functions at the type level, no JSX.
 */
import { expect, test } from "tstyche";
import { defineAppRoute, definePagesRoute, p, rawSearch } from "paramour";
import type { InferRouteParams, SafeResult } from "paramour";
import { z } from "zod";

import {
  useRouteParams,
  useRouteParamsOrThrow,
  useSearch,
  useSearchOrThrow,
} from "../src/app.js";

// Mirrors the fixtures at the top of app.test.tsx.
const appRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const pagesRoute = definePagesRoute("/product/[id]", {
  params: { id: p.integer() },
});

const rawSchema = z.object({
  page: z.coerce.number().optional(),
  q: z.string(),
});
const rawRoute = defineAppRoute("/raw", { search: rawSearch(rawSchema) });

test("AnyAppRoute gate: a pages-branded route is rejected at every call site (PR3)", () => {
  expect(useRouteParams).type.not.toBeCallableWith(pagesRoute);
  expect(useRouteParamsOrThrow).type.not.toBeCallableWith(pagesRoute);
  expect(useSearch).type.not.toBeCallableWith(pagesRoute);
  expect(useSearchOrThrow).type.not.toBeCallableWith(pagesRoute);
});

test("app route is accepted and each hook returns its exact type (PR3/PR12)", () => {
  expect(useRouteParams).type.toBeCallableWith(appRoute);
  expect(useRouteParamsOrThrow).type.toBeCallableWith(appRoute);
  expect(useSearch).type.toBeCallableWith(appRoute);
  expect(useSearchOrThrow).type.toBeCallableWith(appRoute);

  // useRouteParams → SafeResult<InferRouteParams<R>>; OrThrow → the plain object.
  expect(useRouteParams(appRoute)).type.toBe<SafeResult<{ id: number }>>();
  expect(useRouteParams(appRoute)).type.toBe<
    SafeResult<InferRouteParams<typeof appRoute>>
  >();
  expect(useRouteParamsOrThrow(appRoute)).type.toBe<{ id: number }>();

  // useSearch → SafeResult<SearchOutputOf<...>>; OrThrow → the plain object.
  // Optional codecs keep the key PRESENT and add `| undefined` (design-02 D4),
  // so it is `q: string | undefined`, not `q?: string`. Mutual assignability
  // pins exact equality: tstyche's `toBe` treats the unexpanded
  // InferSearchOutput mapped-type alias as non-identical to the literal, but
  // under exactOptionalPropertyTypes each direction below still separates
  // `q: string | undefined` (key required) from `q?: string` (key omittable).
  const search = useSearch(appRoute);
  expect(search).type.toBeAssignableTo<
    SafeResult<{ page: number; q: string | undefined }>
  >();
  expect<
    SafeResult<{ page: number; q: string | undefined }>
  >().type.toBeAssignableTo<typeof search>();

  const searchOrThrow = useSearchOrThrow(appRoute);
  expect(searchOrThrow).type.toBeAssignableTo<{
    page: number;
    q: string | undefined;
  }>();
  expect<{
    page: number;
    q: string | undefined;
  }>().type.toBeAssignableTo<typeof searchOrThrow>();
});

test("rawSearch route infers the schema output, not the marker shape (app.ts cast)", () => {
  // useSearchOrThrow's `as SearchOutputOf<R["~search"]>` cast bridges the
  // AnyAppRoute inference gap to the schema's own output type.
  expect(useSearchOrThrow(rawRoute)).type.toBe<z.infer<typeof rawSchema>>();
  expect(useSearch(rawRoute)).type.toBe<
    SafeResult<z.infer<typeof rawSchema>>
  >();

  // Explicitly: NOT the garbage `{ "~kind", "~schema" }` RawSearch marker shape.
  const out = useSearchOrThrow(rawRoute);
  expect(out).type.not.toHaveProperty("~kind");
  expect(out).type.not.toHaveProperty("~schema");
});
