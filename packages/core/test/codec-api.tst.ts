/**
 * Type-level tests for the p.* codec API (design-02). Ported from spike 02
 * against the real implementation.
 */
import { expect, test } from "tstyche";
import { z } from "zod";

import { p } from "../src";
import type {
  InferSearchInput,
  InferSearchOutput,
  OutputOf,
  PresenceOf,
} from "../src";

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
  expect(p.integer().default(1).default).type.toBe<never>();
  expect(p.integer().catch(0).default(1).catch).type.toBe<never>();
});

test("schema slots are constrained to the codec's wire type", () => {
  // p.integer/p.number take StandardSchemaV1<number, number>; p.string takes
  // StandardSchemaV1<string, string>. A mismatched vendor schema must fail
  // on the argument, not silently widen the codec.
  expect(p.integer).type.not.toBeCallableWith(z.string());
  expect(p.number).type.not.toBeCallableWith(z.string());
  expect(p.string).type.not.toBeCallableWith(z.number());
  expect(p.integer).type.toBeCallableWith(z.number().min(1));
  expect(p.string).type.toBeCallableWith(z.string().min(1));
});

test("p.custom infers Out from a matched parse/serialize pair", () => {
  const codec = p.custom({
    parse: (raw) => BigInt(raw),
    serialize: (value: bigint) => value.toString(),
  });
  expect(codec["~out"]).type.toBe<bigint>();
});

test("exported utility types resolve against built codecs", () => {
  const codec = p.integer().default(1);
  expect<OutputOf<typeof codec>>().type.toBe<number>();
  expect<PresenceOf<typeof codec>>().type.toBe<"defaulted">();
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

test("search input side: omittable keys admit explicit undefined", () => {
  const config = {
    page: p.integer().default(1),
    q: p.string(),
    sort: p.enum(["price", "rating"]).optional(),
    tags: p.stringArray(),
  };
  // Explicit undefined on a defaulted/optional/many key is a second spelling
  // of absence — encodeSearch already omits the key for that value (S3), so
  // the input type admits it. This is what lets a decoded InferSearchOutput
  // (optional presence as `| undefined`) flow straight back into href under
  // exactOptionalPropertyTypes (middleware canonicalization, form state).
  expect<{ page: undefined; q: string }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  expect<{ q: string; sort: undefined }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  expect<{ q: string; tags: undefined }>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
  // A REQUIRED key never accepts undefined — absence there is an error, and
  // encodeSearch throws SerializeError at runtime to match.
  expect<{ q: undefined }>().type.not.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
});

test("search input side: decoded output round-trips into the input type", () => {
  const config = {
    page: p.integer().default(1),
    sort: p.enum(["price", "rating"]).optional(),
    tags: p.stringArray(),
  };
  // The decode→href round-trip: every-key-present output (optional presence
  // contributing `| undefined`) assigns to the input side wholesale.
  expect<InferSearchOutput<typeof config>>().type.toBeAssignableTo<
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
