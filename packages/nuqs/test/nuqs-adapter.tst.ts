import type { inferParserType, SingleParserBuilder } from "nuqs/server";

import { defineAppRoute, p, rawSearch } from "paramour";
import { expect, test } from "tstyche";
import { z } from "zod";

import { nuqsParser, nuqsParsers } from "../src/index.js";

test("scalar codecs derive nullable single parsers (NQ3)", () => {
  expect(nuqsParser(p.string())).type.toBe<SingleParserBuilder<string>>();
  expect(nuqsParser(p.integer())).type.toBe<SingleParserBuilder<number>>();
  expect(nuqsParser(p.isoDate())).type.toBe<SingleParserBuilder<Date>>();
  expect(nuqsParser(p.csv(p.integer()))).type.toBe<
    SingleParserBuilder<number[]>
  >();
});

test("enum keeps its literal union", () => {
  expect(nuqsParser(p.enum(["price", "rating"]))).type.toBe<
    SingleParserBuilder<"price" | "rating">
  >();
});

test("optional collapses to the nullable parser (NQ3)", () => {
  expect(nuqsParser(p.string().optional())).type.toBe<
    SingleParserBuilder<string>
  >();
});

test("value-form defaults derive a non-nullable withDefault shape (NQ6/NQ6a)", () => {
  const parser = nuqsParser(p.integer().default(1));
  expect(parser.defaultValue).type.toBe<number>();
  expect(parser.parse).type.toBeCallableWith("3");
});

test("factory defaults stay honestly nullable (NQ6/NQ6a)", () => {
  expect(nuqsParser(p.integer().default(() => 1))).type.toBe<
    SingleParserBuilder<number>
  >();
});

test("arity-many codecs derive a non-nullable multi parser (NQ8a)", () => {
  const parser = nuqsParser(p.array());
  expect(parser.defaultValue).type.toBe<string[]>();
  expect(parser.serialize).type.toBeCallableWith(["a"]);
  expect(parser.parse).type.toBeCallableWith(["a", "b"]);
});

test("typed array elements carry E[] through the multi parser (PP1)", () => {
  const parser = nuqsParser(p.array(p.integer()));
  expect(parser.defaultValue).type.toBe<number[]>();
  expect(parser.serialize).type.toBeCallableWith([1, 2]);
  expect(parser.serialize).type.not.toBeCallableWith(["a"]);
});

test("the derived map is ordinary nuqs currency with per-key nullability", () => {
  const map = nuqsParsers({
    labels: p.csv(),
    page: p.integer().default(1),
    q: p.string().optional(),
    stamp: p.isoDate().default(() => new Date(0)),
    tags: p.array(),
  });
  expect<inferParserType<typeof map>>().type.toBe<{
    labels: null | string[];
    page: number;
    q: null | string;
    stamp: Date | null;
    tags: string[];
  }>();
});

test("route objects use the route overload and keep the search config's shape", () => {
  const route = defineAppRoute("/interop", {
    search: { page: p.integer().default(1), q: p.string().optional() },
  });
  const map = nuqsParsers(route);
  expect(map.page.defaultValue).type.toBe<number>();
  expect<inferParserType<typeof map>>().type.toBe<{
    page: number;
    q: null | string;
  }>();
});

test("null-including outputs are rejected at the call (NQ8/NQ8b)", () => {
  const nullable = p.custom<null | string>({
    parse: (raw) => (raw === "null" ? null : raw),
    serialize: (value) => value ?? "null",
  });
  expect(nuqsParser).type.not.toBeCallableWith(nullable);
  expect(nuqsParsers).type.not.toBeCallableWith({ q: nullable });
  expect(nuqsParsers).type.not.toBeCallableWith({
    ok: p.string(),
    q: nullable,
  });
});

test("rawSearch and search-less routes are rejected at the call (NQ8/NQ8b)", () => {
  const raw = defineAppRoute("/raw", {
    search: rawSearch(z.object({ q: z.string() })),
  });
  expect(nuqsParsers).type.not.toBeCallableWith(raw);
  expect(nuqsParsers).type.not.toBeCallableWith(defineAppRoute("/plain", {}));
  expect(nuqsParsers).type.not.toBeCallableWith({});
});
