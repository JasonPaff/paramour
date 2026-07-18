import type { SingleParserBuilder } from "nuqs/server";
import type { AnyCodec } from "paramour";

import { createLoader, createSerializer } from "nuqs/server";
import {
  buildSearchString,
  decodeSearch,
  defineAppRoute,
  encodeSearch,
  p,
  ParamourError,
  rawSearch,
  SearchDecodeError,
} from "paramour";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { nuqsParser, nuqsParsers } from "../src/index.js";

/**
 * Bypasses the compile-time argument gates for table-driven and
 * structurally-built codecs; runtime behavior is what's under test.
 */
const derive = (codec: AnyCodec) =>
  nuqsParser(codec as never) as unknown as SingleParserBuilder<unknown>;

const decodeOne = (codec: AnyCodec, wire: string | string[]): unknown =>
  (decodeSearch({ k: codec }, { k: wire }) as Record<string, unknown>).k;

const encodeWire = (codec: AnyCodec, value: unknown): string => {
  const pairs = encodeSearch({ k: codec }, { k: value });
  const pair = pairs[0];
  if (pairs.length !== 1 || pair === undefined) {
    throw new Error(
      `expected exactly one wire pair, got ${String(pairs.length)}`,
    );
  }
  return pair[1];
};

describe("per-kind round-trips match decodeSearch/encodeSearch", () => {
  const kinds: { codec: AnyCodec; name: string; value: unknown }[] = [
    { codec: p.boolean(), name: "boolean", value: true },
    { codec: p.csv(), name: "csv", value: ["a", "b c"] },
    { codec: p.csv(p.integer()), name: "csv(integer)", value: [1, 2, 3] },
    {
      codec: p.custom<string>({
        label: "upper",
        parse: (raw) => raw.toUpperCase(),
        serialize: (value) => value.toLowerCase(),
      }),
      name: "custom",
      value: "HELLO",
    },
    { codec: p.enum(["price", "rating"]), name: "enum", value: "rating" },
    { codec: p.index(), name: "index", value: 4 },
    { codec: p.integer(), name: "integer", value: 42 },
    {
      codec: p.isoDate(),
      name: "isoDate",
      value: new Date("2024-11-05T00:00:00.000Z"),
    },
    {
      codec: p.json(z.object({ a: z.number() })),
      name: "json",
      value: { a: 1 },
    },
    { codec: p.number(), name: "number", value: 1.5 },
    { codec: p.string(), name: "string", value: "a b" },
    {
      codec: p.timestamp(),
      name: "timestamp",
      value: new Date(1_700_000_000_000),
    },
  ];

  it.each(kinds)("$name", ({ codec, value }) => {
    const parser = derive(codec);
    const wire = encodeWire(codec, value);
    // The derived serializer produces the exact wire string encodeSearch does.
    expect(parser.serialize(value)).toBe(wire);
    // The derived parse agrees with the server decode of the same wire value.
    expect(parser.parse(wire)).toEqual(decodeOne(codec, wire));
    expect(parser.parse(wire)).toEqual(value);
    // nuqs's bijectivity requirement: parse(serialize(x)) round-trips.
    expect(parser.parse(parser.serialize(value))).toEqual(value);
  });
});

describe("eq is wire-form equality (NQ4)", () => {
  it("distinct Date objects with the same wire form are equal", () => {
    const parser = derive(p.isoDate());
    // isoDate's wire form is the DAY — same day, different instants.
    expect(
      parser.eq(
        new Date("2024-11-05T08:00:00.000Z"),
        new Date("2024-11-05T20:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      parser.eq(
        new Date("2024-11-05T00:00:00.000Z"),
        new Date("2024-11-06T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("csv arrays compare by content, not reference", () => {
    const parser = derive(p.csv());
    expect(parser.eq(["a", "b"], ["a", "b"])).toBe(true);
    expect(parser.eq(["a"], ["a", "b"])).toBe(false);
  });

  it("a normalizing custom serializer drives eq through the wire", () => {
    const codec = p.custom<string>({
      parse: (raw) => raw,
      serialize: (value) => value.toLowerCase(),
    });
    expect(derive(codec).eq("HELLO", "hello")).toBe(true);
  });
});

describe("clearOnDefault parity with D8 elision (NQ4/NQ5)", () => {
  const config = {
    labels: p.csv().default(["a"]),
    page: p.integer().default(1),
  };

  it("eq(value, default) agrees with encodeSearch elision, value by value", () => {
    const map = nuqsParsers(config);
    for (const candidate of [1, 2, 42]) {
      const elided = !encodeSearch(config, { page: candidate }).some(
        ([key]) => key === "page",
      );
      expect(map.page.eq(candidate, map.page.defaultValue)).toBe(elided);
    }
    for (const candidate of [["a"], ["a", "b"], []]) {
      const elided = !encodeSearch(config, { labels: candidate }).some(
        ([key]) => key === "labels",
      );
      expect(map.labels.eq(candidate, map.labels.defaultValue)).toBe(elided);
    }
  });

  it("both writers produce the identical canonical URL", () => {
    const map = nuqsParsers(config);
    const serialize = createSerializer(map);
    expect(serialize({ page: 1 })).toBe(
      buildSearchString(encodeSearch(config, { page: 1 })),
    );
    expect(serialize({ page: 1 })).toBe("");
    expect(serialize({ page: 3 })).toBe(
      buildSearchString(encodeSearch(config, { page: 3 })),
    );
    expect(serialize({ labels: ["a"] })).toBe(
      buildSearchString(encodeSearch(config, { labels: ["a"] })),
    );
  });
});

describe("defaults (NQ6)", () => {
  it("value-form defaults derive withDefault with a derivation-time snapshot", () => {
    const parser = nuqsParser(p.integer().default(1));
    expect(parser.defaultValue).toBe(1);
    expect(parser.parse("junk")).toBeNull(); // withDefault does not affect parse
  });

  it("the snapshot is frozen; core's live elision follows a mutated default (documented divergence)", () => {
    const original = ["a"];
    const codec = p.csv().default(original);
    const map = nuqsParsers({ labels: codec });
    original.push("b");
    // The nuqs side froze the derivation-time copy…
    expect(map.labels.defaultValue).toEqual(["a"]);
    expect(map.labels.eq(["a", "b"], map.labels.defaultValue)).toBe(false);
    // …while core re-reads the (mutated) default live per encode.
    expect(encodeSearch({ labels: codec }, { labels: ["a", "b"] })).toEqual([]);
  });

  it("factory defaults derive a nullable parser with no defaultValue", () => {
    const parser = nuqsParser(p.isoDate().default(() => new Date(0)));
    expect("defaultValue" in parser).toBe(false);
    expect(parser.parse("2024-11-05")).toEqual(
      new Date("2024-11-05T00:00:00.000Z"),
    );
  });
});

describe(".catch() parity, then null (NQ7)", () => {
  it(".catch(value) recovers a malformed wire value before nuqs's null", () => {
    const parser = nuqsParser(p.integer().catch(0));
    expect(parser.parse("junk")).toBe(0);
    expect(parser.parse("7")).toBe(7);
  });

  it(".catch(factory) is invoked per parse", () => {
    let n = 0;
    const parser = nuqsParser(
      p.integer().catch(() => {
        n += 1;
        return n;
      }),
    );
    expect(parser.parse("junk")).toBe(1);
    expect(parser.parse("junk")).toBe(2);
  });

  it("a throwing catch factory propagates loud", () => {
    const parser = nuqsParser(
      p.integer().catch((): number => {
        throw new Error("boom");
      }),
    );
    expect(() => parser.parse("junk")).toThrow(ParamourError);
    expect(() => parser.parse("junk")).toThrow(/factory threw/);
  });

  it("without .catch(), a malformed value reads as nuqs's null", () => {
    expect(nuqsParser(p.integer()).parse("junk")).toBeNull();
  });

  it("foreign throws from p.custom parse are ParseError-branded, so .catch recovers them", () => {
    const codec = p
      .custom<string>({
        parse: (raw) => {
          if (raw === "bad") throw new TypeError("foreign failure");
          return raw;
        },
        serialize: (value) => value,
      })
      .catch("fallback");
    const parser = nuqsParser(codec);
    expect(parser.parse("ok")).toBe("ok");
    expect(parser.parse("bad")).toBe("fallback");
  });

  it("paramour contract violations propagate even with .catch (only ParseError translates)", () => {
    const codec = p
      .custom<string>({
        parse: (raw) => {
          if (raw === "boom") throw new ParamourError("config-side failure");
          return raw;
        },
        serialize: (value) => value,
      })
      .catch("fallback");
    const parser = nuqsParser(codec);
    expect(() => parser.parse("boom")).toThrow(ParamourError);
    expect(() => parser.parse("boom")).toThrow("config-side failure");
  });
});

describe("arity-many codecs derive multi parsers (NQ8a)", () => {
  it("round-trips repeated keys, absent reads []", () => {
    const parser = nuqsParser(p.array());
    expect(parser.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(parser.serialize(["a", "b"])).toEqual(["a", "b"]);
    expect(parser.defaultValue).toEqual([]);
  });

  it("PP1: a typed element crosses the same derivation path unchanged", () => {
    const parser = nuqsParser(p.array(p.integer()));
    expect(parser.parse(["1", "2"])).toEqual([1, 2]);
    expect(parser.serialize([1, 2])).toEqual(["1", "2"]);
    expect(parser.eq([1, 2], [1, 2])).toBe(true);
    expect(parser.defaultValue).toEqual([]);
  });

  it("eq is element-wise wire-string equality", () => {
    const parser = nuqsParser(p.array());
    expect(parser.eq(["a", "b"], ["a", "b"])).toBe(true);
    expect(parser.eq(["a", "b"], ["a"])).toBe(false);
    expect(parser.eq(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("createLoader sees every repeated key, agreeing with the server decode", () => {
    const config = { tags: p.array() };
    const load = createLoader(nuqsParsers(config));
    const url = buildSearchString(encodeSearch(config, { tags: ["a", "b"] }));
    expect(load(url)).toEqual({ tags: ["a", "b"] });
    expect(load(url)).toEqual(decodeSearch(config, new URLSearchParams(url)));
    expect(load("http://x/?")).toEqual({ tags: [] }); // absent ≡ [] (S6/P6)
  });

  it("a failing element resolves the whole key to catch, then null (whole-key recovery)", () => {
    // p.array(p.integer()) is the public arity-many builder with a failing
    // element parse (PP1); the adapter mirrors decodeSearch's whole-key
    // recovery, never a per-element one.
    expect(
      nuqsParser(p.array(p.integer()).catch([0])).parse(["1", "x"]),
    ).toEqual([0]);
    expect(nuqsParser(p.array(p.integer())).parse(["1", "x"])).toBeNull();
  });
});

describe("duplicate-scalar keys: the NQ7 read-path asymmetry, executable", () => {
  it("nuqs reads the first value where the server decode reports P5", () => {
    const config = { page: p.integer() };
    const load = createLoader(nuqsParsers(config));
    expect(load("http://x/?page=1&page=2")).toEqual({ page: 1 });
    expect(() =>
      decodeSearch(config, new URLSearchParams("page=1&page=2")),
    ).toThrow(SearchDecodeError);
  });

  it("with .catch, the server recovers to the catch value while nuqs still reads the first", () => {
    const config = { page: p.integer().catch(0) };
    expect(decodeSearch(config, new URLSearchParams("page=1&page=2"))).toEqual({
      page: 0,
    });
    expect(
      createLoader(nuqsParsers(config))("http://x/?page=1&page=2"),
    ).toEqual({ page: 1 });
  });
});

describe("runtime rejections (NQ8b backstops)", () => {
  it("rejects rawSearch routes", () => {
    const route = defineAppRoute("/raw", {
      search: rawSearch(z.object({ q: z.string() })),
    });
    expect(() => nuqsParsers(route as never)).toThrow(ParamourError);
    expect(() => nuqsParsers(route as never)).toThrow(/rawSearch/);
  });

  it("rejects search-less routes and empty configs", () => {
    const route = defineAppRoute("/plain", {});
    expect(() => nuqsParsers(route as never)).toThrow(ParamourError);
    expect(() => nuqsParsers({} as never)).toThrow(ParamourError);
  });

  it("rejects non-object sources", () => {
    expect(() => nuqsParsers(null as never)).toThrow(ParamourError);
    expect(() => nuqsParsers(42 as never)).toThrow(ParamourError);
  });

  it("rejects non-codec map values, naming the key", () => {
    expect(() => nuqsParsers({ q: 42 } as never)).toThrow(ParamourError);
    expect(() => nuqsParsers({ q: 42 } as never)).toThrow(/"q"/);
    expect(() => nuqsParser(42 as never)).toThrow(ParamourError);
  });
});

describe("route objects and bare configs are interchangeable (NQ2)", () => {
  const route = defineAppRoute("/interop", {
    search: {
      page: p.integer().default(1),
      q: p.string().optional(),
      tags: p.array(),
    },
  });

  it("derives the identical map from either shape", () => {
    const fromRoute = nuqsParsers(route);
    const fromConfig = nuqsParsers(route["~search"]);
    expect(Object.keys(fromRoute)).toEqual(Object.keys(fromConfig));
    expect(fromRoute.page.defaultValue).toBe(1);
    expect(fromConfig.page.defaultValue).toBe(1);
  });

  it('a config key literally named "~router" stays a config key, not a route brand', () => {
    // Wire keys are arbitrary strings — core round-trips "~router=x" like any
    // other key — so route detection must probe the brand's VALUE (a route
    // carries a RouterKind string there), never mere key presence.
    const map = nuqsParsers({ "~router": p.string() });
    expect(map["~router"].parse("x")).toBe("x");
  });

  it("what the derived parsers write, the route's server decode re-reads identically", () => {
    const config = route["~search"];
    const map = nuqsParsers(route);
    const input = { page: 3, q: "hi", tags: ["a", "b"] };
    const url = buildSearchString(encodeSearch(config, input));
    expect(createLoader(map)(`http://x/${url}`)).toEqual(
      decodeSearch(config, new URLSearchParams(url)),
    );
  });
});
