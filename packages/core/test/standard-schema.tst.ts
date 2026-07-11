/**
 * Type-level tests for `standardSearchSchema` (design-08 STD1/STD3/STD8),
 * world A: augmentation-free. This file must NEVER gain a `declare module`
 * augmentation (see route-api.tst.ts header).
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";

import { expect, test } from "tstyche";
import { z } from "zod";

import type { StandardSearchSchema } from "../src";

import { defineAppRoute, p, rawSearch, standardSearchSchema } from "../src";

const mixedRoute = defineAppRoute("/items", {
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
    tags: p.stringArray(),
  },
});

test("STD3: advertised input is the wire-shaped record only — no URLSearchParams arm", () => {
  const schema = standardSearchSchema(mixedRoute);
  expect<StandardSchemaV1.InferInput<typeof schema>>().type.toBe<
    Record<string, string | string[] | undefined>
  >();
});

test("STD1/D4: output has every declared key, optional presence as `| undefined`", () => {
  // Properties are readonly: InferSearchOutput maps homomorphically over the
  // route's (readonly) config properties (route-api.tst.ts precedent).
  const schema = standardSearchSchema(mixedRoute);
  expect<StandardSchemaV1.InferOutput<typeof schema>>().type.toBe<{
    readonly page: number;
    readonly q: string | undefined;
    readonly tags: string[];
  }>();
});

test("STD8: a rawSearch route's output is the inner schema's inferred output", () => {
  const route = defineAppRoute("/raw", {
    search: rawSearch(z.object({ page: z.coerce.number(), q: z.string() })),
  });
  const schema = standardSearchSchema(route);
  expect<StandardSchemaV1.InferOutput<typeof schema>>().type.toBe<{
    page: number;
    q: string;
  }>();
});

test("the returned schema is assignable to StandardSchemaV1 — the consumer-facing shape", () => {
  const schema = standardSearchSchema(mixedRoute);
  expect(schema).type.toBeAssignableTo<StandardSchemaV1>();
});

test("StandardSearchSchema<SC> names the function's exact return type", () => {
  expect(standardSearchSchema(mixedRoute)).type.toBe<
    StandardSearchSchema<(typeof mixedRoute)["~search"]>
  >();
});
