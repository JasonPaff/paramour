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
  expect(p.array()["~out"]).type.toBe<string[]>();
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

test(".default() overloads expose value vs factory form in type-state (NQ6a)", () => {
  // Value form participates in D8 elision; factory form never does. The
  // literal-typed ~defaultElides lets derived surfaces (@paramour-js/nuqs)
  // give value-defaulted keys non-nullable reads.
  expect(p.integer().default(1)["~defaultElides"]).type.toBe<true>();
  expect(p.integer().default(() => 1)["~defaultElides"]).type.toBe<false>();
  // The literal survives further chaining, in either modifier order.
  expect(p.integer().default(1).catch(0)["~defaultElides"]).type.toBe<true>();
  expect(
    p
      .integer()
      .default(() => 1)
      .catch(0)["~defaultElides"],
  ).type.toBe<false>();
  expect(p.integer().catch(0).default(1)["~defaultElides"]).type.toBe<true>();
  // Before .default() the flag is unresolved type-state (runtime false).
  expect(p.integer()["~defaultElides"]).type.toBe<boolean>();
});

test(".default() never infers the value branch for a function argument (NQ6a)", () => {
  // Runtime isFactory treats ANY function as a factory, so a function
  // argument must either match the factory overload or fail to compile —
  // an inferred E=true that the runtime would contradict (absent key reads
  // null where the type promises the default) is never allowed.
  const fnOut = p.custom<() => string>({
    parse: () => () => "hi",
    serialize: () => "hi",
  });
  // A function-typed Out can only be defaulted through the factory form...
  expect(fnOut.default(() => () => "hi")["~defaultElides"]).type.toBe<false>();
  // ...a bare function (the runtime would invoke it) is rejected.
  expect(fnOut.default).type.not.toBeCallableWith(() => "hi");
  // Wide Out: a non-nullary function is neither a factory nor a value.
  const wide = p.custom<unknown>({ parse: (raw) => raw, serialize: String });
  expect(wide.default).type.not.toBeCallableWith((x: number) => x);
  // A union that may be a function at runtime resolves neither branch.
  expect(p.integer().default).type.not.toBeCallableWith(
    0 as number | (() => number),
  );
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

test("p.csv infers E[] output, string[] when no element is given", () => {
  expect(p.csv()["~out"]).type.toBe<string[]>();
  expect(p.csv(p.integer())["~out"]).type.toBe<number[]>();
  expect(p.csv(p.enum(["a", "b"]))["~out"]).type.toBe<("a" | "b")[]>();
  expect(p.csv(p.isoDate())["~out"]).type.toBe<Date[]>();
});

test("p.csv rejects modified and arity-many elements (CV2)", () => {
  expect(p.csv).type.toBeCallableWith(p.integer());
  expect(p.csv).type.not.toBeCallableWith(p.integer().optional());
  expect(p.csv).type.not.toBeCallableWith(p.integer().default(1));
  expect(p.csv).type.not.toBeCallableWith(p.integer().catch(0));
  expect(p.csv).type.not.toBeCallableWith(p.array());
  // The one type-level hole: a nested csv is structurally an unmodified
  // single scalar, so it compiles — the runtime ParamourError guard in
  // codecs.test.ts is the backstop (CV2).
  expect(p.csv).type.toBeCallableWith(p.csv());
});

test("p.csv takes ordinary modifier chains (scalar arity, CV5)", () => {
  expect(p.csv().default).type.toBeCallableWith([]);
  expect(p.csv(p.integer()).default).type.toBeCallableWith([1, 2]);
  expect(p.csv(p.integer()).default).type.not.toBeCallableWith(["x"]);
  expect(p.csv()["~arity"]).type.toBe<"single">();
  expect(p.csv().default([])["~presence"]).type.toBe<"defaulted">();
  expect(
    p
      .csv()
      .catch((): string[] => [])
      .optional()["~presence"],
  ).type.toBe<"optional">();
  expect(p.csv().optional().optional).type.toBe<never>();
  expect(p.csv().default([]).default).type.toBe<never>();
});

test("p.array infers E[] output, string[] when no element is given (PP1)", () => {
  expect(p.array()["~out"]).type.toBe<string[]>();
  expect(p.array(p.integer())["~out"]).type.toBe<number[]>();
  expect(p.array(p.enum(["a", "b"]))["~out"]).type.toBe<("a" | "b")[]>();
  expect(p.array(p.isoDate())["~out"]).type.toBe<Date[]>();
});

test("p.array rejects modified and arity-many elements (PP1)", () => {
  expect(p.array).type.toBeCallableWith(p.integer());
  expect(p.array).type.not.toBeCallableWith(p.integer().optional());
  expect(p.array).type.not.toBeCallableWith(p.integer().default(1));
  expect(p.array).type.not.toBeCallableWith(p.integer().catch(0));
  expect(p.array).type.not.toBeCallableWith(p.array());
  // Unlike csv's nested-csv hole (CV2), a csv element is deliberately legal
  // here: one whole comma-packed value per repeated key (PP1).
  expect(p.array).type.toBeCallableWith(p.csv(p.integer()));
});

test("p.index is an ordinary single-arity integer shape (PP5)", () => {
  expect(p.index()["~out"]).type.toBe<number>();
  expect(p.index()["~arity"]).type.toBe<"single">();
  expect(p.index().default(0)["~presence"]).type.toBe<"defaulted">();
  expect(p.index().optional()["~presence"]).type.toBe<"optional">();
  expect(p.index().catch(0)["~caught"]).type.toBe<true>();
  expect(p.index().optional().optional).type.toBe<never>();
  expect(p.index().default(0).default).type.toBe<never>();
});

test("array codecs reject presence modifiers; catch stays legal", () => {
  expect(p.array().default).type.toBe<never>();
  expect(p.array().optional).type.toBe<never>();
  expect(p.array().catch).type.toBeCallableWith(["a"]);
});

test("catch preserves 'many' arity", () => {
  expect(p.array().catch(["a"])["~arity"]).type.toBe<"many">();
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
    tags: p.array(),
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
    tags: p.array(),
  };
  // The decode→href round-trip: every-key-present output (optional presence
  // contributing `| undefined`) assigns to the input side wholesale.
  expect<InferSearchOutput<typeof config>>().type.toBeAssignableTo<
    InferSearchInput<typeof config>
  >();
});

test("array codecs: output key always present as an array", () => {
  const config = { tags: p.array() };
  expect<InferSearchOutput<typeof config>>().type.toBe<{ tags: string[] }>();
});

test("array codecs: input key may be omitted (absent ≡ [])", () => {
  const config = { q: p.string(), tags: p.array() };
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
