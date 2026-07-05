/**
 * Type-level tests for the p.* codec API (design-02). Ported from spike 02
 * against the real implementation.
 */
import { expect, test } from "tstyche";
import { z } from "zod";

import { p } from "../src";
import type { InferSearchInput, InferSearchOutput } from "../src";

test("base builders carry their output types", () => {
  expect(p.string()["~out"]).type.toBe<string>();
  expect(p.integer()["~out"]).type.toBe<number>();
  expect(p.boolean()["~out"]).type.toBe<boolean>();
  expect(p.isoDate()["~out"]).type.toBe<Date>();
  expect(p.stringArray()["~out"]).type.toBe<string[]>();
});

test("enum keeps its literal union through const inference", () => {
  expect(p.enum(["price", "rating"])["~out"]).type.toBe<"price" | "rating">();
});

test("modifiers update presence type-state", () => {
  expect(p.integer()["~presence"]).type.toBe<"required">();
  expect(p.integer().default(1)["~presence"]).type.toBe<"defaulted">();
  expect(p.integer().optional()["~presence"]).type.toBe<"optional">();
  expect(p.integer().catch(0)["~caught"]).type.toBe<true>();
  expect(p.integer().catch(0).default(1)["~presence"]).type.toBe<"defaulted">();
});

test("modifier arguments are typed", () => {
  expect(p.integer().default).type.toBeCallableWith(1);
  expect(p.integer().default).type.not.toBeCallableWith("x");
  expect(p.enum(["a", "b"]).catch).type.not.toBeCallableWith("c");
});

test("illegal chains are not callable", () => {
  // Type-state disables illegal modifiers by collapsing them to `never`.
  expect(p.string().optional().default).type.toBe<never>();
  expect(p.string().default("a").optional).type.toBe<never>();
  expect(p.integer().catch(0).catch).type.toBe<never>();
  expect(p.string().optional().optional).type.toBe<never>();
});

test("array codecs reject presence modifiers; catch stays legal", () => {
  expect(p.stringArray().default).type.toBe<never>();
  expect(p.stringArray().optional).type.toBe<never>();
  expect(p.stringArray().catch).type.toBeCallableWith(["a"]);
});

test("catch preserves 'many' arity", () => {
  expect(p.stringArray().catch(["a"])["~arity"]).type.toBe<"many">();
});

test("default and catch accept a factory form", () => {
  expect(p.integer().default).type.toBeCallableWith(() => 1);
  expect(p.integer().catch).type.toBeCallableWith(() => 0);
  expect(p.integer().default).type.not.toBeCallableWith(() => "x");
});

test("Standard Schema refinements carry the schema output type", () => {
  const branded = p.string(z.string().brand<"UserId">());
  expect(branded["~out"]).type.toBe<string & z.$brand<"UserId">>();

  const filters = p.json(z.object({ maxPrice: z.number() }));
  expect(filters["~out"]).type.toBe<{ maxPrice: number }>();
});

test("search output side: keys always present, optional adds undefined", () => {
  const config = {
    page: p.integer().default(1),
    q: p.string(),
    sort: p.enum(["price", "rating"]).optional(),
  };
  expect<InferSearchOutput<typeof config>>().type.toBe<{
    page: number;
    q: string;
    sort: "price" | "rating" | undefined;
  }>();
});

test("search input side: defaulted and optional keys may be omitted", () => {
  const config = {
    page: p.integer().default(1),
    q: p.string(),
    sort: p.enum(["price", "rating"]).optional(),
  };
  expect<{ q: string }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  expect<{ page: number; q: string }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  expect<{ page: number }>().type.not.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
});

test("array codecs: output key always present as an array", () => {
  const config = { tags: p.stringArray() };
  expect<InferSearchOutput<typeof config>>().type.toBe<{ tags: string[] }>();
});

test("array codecs: input key may be omitted (absent ≡ [])", () => {
  const config = { q: p.string(), tags: p.stringArray() };
  expect<{ q: string }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  expect<{ q: string; tags: string[] }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  // Negative pin: an array key's optionality must not leak onto required
  // scalar keys (a regression making ALL keys optional when any array key
  // exists would pass every positive assertion above).
  expect<{ tags: string[] }>().type.not.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
});
