/**
 * Wire-format conformance suite — one test per case in wire-format spec §7.
 */
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Codec, InferSearchInput } from "../src";

import {
  buildPath,
  buildSearchString,
  decodeParams,
  decodeSearch,
  defineRoute,
  encodeParams,
  encodeSearch,
  p,
  ParamourError,
  ParseError,
  SearchDecodeError,
  searchToString,
  SerializeError,
} from "../src";

describe("empty string vs absent", () => {
  it("C1: q= decodes to the empty string for p.string()", () => {
    expect(decodeSearch({ q: p.string() }, { q: "" })).toEqual({ q: "" });
  });

  it("C2: absent required param is an error; default/optional apply", () => {
    expect(() => decodeSearch({ q: p.string() }, {})).toThrow(
      SearchDecodeError,
    );
    expect(decodeSearch({ q: p.string().default("d") }, {})).toEqual({
      q: "d",
    });
    expect(decodeSearch({ q: p.string().optional() }, {})).toEqual({
      q: undefined,
    });
  });

  it("C3: bare ?q is indistinguishable from ?q= and decodes identically", () => {
    expect(decodeSearch({ q: p.string() }, new URLSearchParams("q"))).toEqual({
      q: "",
    });
  });

  it("empty string fails non-string scalar codecs", () => {
    expect(() => decodeSearch({ page: p.integer() }, { page: "" })).toThrow(
      SearchDecodeError,
    );
  });
});

describe("numeric grammars over the wire", () => {
  it("C4: page=2 decodes to 2", () => {
    expect(decodeSearch({ page: p.integer() }, { page: "2" })).toEqual({
      page: 2,
    });
  });

  it("C5: page=1e3 is a parse error for p.integer()", () => {
    expect(() => decodeSearch({ page: p.integer() }, { page: "1e3" })).toThrow(
      SearchDecodeError,
    );
  });

  it("C7: x=1e%2B21 survives the platform + decoding and parses", () => {
    const source = new URLSearchParams("x=1e%2B21");
    expect(decodeSearch({ x: p.number() }, source)).toEqual({ x: 1e21 });
  });

  it("C8: x=0x10 is a parse error for p.number()", () => {
    expect(() => decodeSearch({ x: p.number() }, { x: "0x10" })).toThrow(
      SearchDecodeError,
    );
  });
});

describe("duplicate keys", () => {
  it("C6: duplicates on a scalar codec are a parse error", () => {
    const source = new URLSearchParams("page=2&page=3");
    expect(() => decodeSearch({ page: p.integer() }, source)).toThrow(
      SearchDecodeError,
    );
  });

  it("C6 + .catch(): recoverable", () => {
    const source = new URLSearchParams("page=2&page=3");
    expect(decodeSearch({ page: p.integer().catch(1) }, source)).toEqual({
      page: 1,
    });
  });
});

describe("booleans and enums", () => {
  it("C9: on=TRUE is a parse error", () => {
    expect(() => decodeSearch({ on: p.boolean() }, { on: "TRUE" })).toThrow(
      SearchDecodeError,
    );
  });

  it("C19: enum member decodes", () => {
    expect(
      decodeSearch({ sort: p.enum(["price", "rating"]) }, { sort: "price" }),
    ).toEqual({
      sort: "price",
    });
  });
});

describe("arrays (repeated keys)", () => {
  it("C10: order and duplicate values are preserved", () => {
    const source = new URLSearchParams("tag=a&tag=b&tag=a");
    expect(decodeSearch({ tag: p.stringArray() }, source)).toEqual({
      tag: ["a", "b", "a"],
    });
  });

  it("C11: absent decodes to []", () => {
    expect(decodeSearch({ tag: p.stringArray() }, {})).toEqual({ tag: [] });
  });

  it("C12: a single occurrence decodes to a one-element array", () => {
    expect(decodeSearch({ tag: p.stringArray() }, { tag: "a" })).toEqual({
      tag: ["a"],
    });
  });

  it("C15: serializing [] emits nothing", () => {
    expect(searchToString({ tag: p.stringArray() }, { tag: [] })).toBe("");
  });

  it("S6: an omitted array key encodes to nothing (absent ≡ [])", () => {
    expect(searchToString({ tag: p.stringArray() }, {})).toBe("");
  });
});

describe("byte-layer serialization", () => {
  it("C13: unicode round-trips byte-exact through the platform decoder", () => {
    const wire = searchToString({ q: p.string() }, { q: "héllo wörld" });
    const decoded = decodeSearch(
      { q: p.string() },
      new URLSearchParams(wire.slice(1)),
    );
    expect(decoded).toEqual({ q: "héllo wörld" });
  });

  it("C14: space encodes as %20, never +", () => {
    expect(searchToString({ q: p.string() }, { q: "a b" })).toBe("?q=a%20b");
  });

  it("C20: a lone surrogate is a serialization error (S7)", () => {
    expect(() => buildSearchString([["q", "\uD800"]])).toThrow(SerializeError);
  });

  it("S3: only the empty string emits key=", () => {
    expect(searchToString({ q: p.string() }, { q: "" })).toBe("?q=");
  });
});

describe("route param segments", () => {
  it('C16: serializing "" into [id] is a serialization error (R4)', () => {
    const route = defineRoute("/user/[id]", { params: { id: p.string() } });
    expect(() => buildPath(route, { id: "" })).toThrow(SerializeError);
    expect(() => encodeParams(route, { id: "" })).toThrow(SerializeError);
  });

  it("C17: catch-all elements encode %2F and decode element-wise (R2/R5)", () => {
    const route = defineRoute("/[...slug]", { params: { slug: p.string() } });
    expect(buildPath(route, { slug: ["a/b", "c"] })).toBe("/a%2Fb/c");
    // Decode side receives Next's already-decoded values (R5); the %2F E2E
    // pin against Next itself is wire-spec open item 1 (@paramour/next).
    expect(decodeParams(route, { slug: ["a/b", "c"] })).toEqual({
      slug: ["a/b", "c"],
    });
  });
});

describe("json codec over the wire", () => {
  it("C18: percent-encoded JSON decodes and validates", () => {
    const schema = z.object({ a: z.number() });
    const source = new URLSearchParams("f=%7B%22a%22%3A1%7D");
    expect(decodeSearch({ f: p.json(schema) }, source)).toEqual({
      f: { a: 1 },
    });
  });
});

describe("determinism and elision", () => {
  it("S5: pairs follow config declaration order", () => {
    // eslint-disable-next-line perfectionist/sort-objects -- declaration order is the point
    const config = { b: p.string(), a: p.string() };
    expect(encodeSearch(config, { a: "2", b: "1" })).toEqual([
      ["b", "1"],
      ["a", "2"],
    ]);
  });

  it("D8: params equal to their default are elided", () => {
    const config = { page: p.integer().default(1) };
    expect(searchToString(config, { page: 1 })).toBe("");
    expect(searchToString(config, { page: 2 })).toBe("?page=2");
    expect(searchToString(config, {})).toBe("");
  });

  it("explicit default still parses (parse side unaffected by elision)", () => {
    expect(
      decodeSearch({ page: p.integer().default(1) }, { page: "1" }),
    ).toEqual({ page: 1 });
  });

  it("a schema-invalid value default throws at .default() time, not per encode", () => {
    expect(() => p.integer(z.number().max(5)).default(10)).toThrow(
      SerializeError,
    );
    // A valid config still encodes valid explicit values (and elides the default).
    const config = { page: p.integer(z.number().max(5)).default(3) };
    expect(searchToString(config, { page: 4 })).toBe("?page=4");
    expect(searchToString(config, { page: 3 })).toBe("");
  });

  it("D8 elision tracks the live default: mutating a reference-typed default cannot desync encode from decode", () => {
    const initial = { view: "grid" };
    const config = {
      f: p.json(z.object({ view: z.string() })).default(initial),
    };
    initial.view = "list";
    // The stale config-time value is explicit input now — it must survive.
    expect(searchToString(config, { f: { view: "grid" } })).toBe(
      "?f=%7B%22view%22%3A%22grid%22%7D",
    );
    // The live default elides.
    expect(searchToString(config, { f: { view: "list" } })).toBe("");
  });
});

describe("decode-side hygiene", () => {
  it("P8: unknown keys are ignored", () => {
    expect(decodeSearch({ q: p.string() }, { other: "x", q: "hi" })).toEqual({
      q: "hi",
    });
  });

  it("P8: malformed values under unknown keys are ignored, not validated", () => {
    // Real-world sources (Express + qs) put numbers and nested objects under
    // keys paramour doesn't own; those must never fail a decode.
    const source = { filter: { x: "1" }, junk: 42, q: "ok" };
    expect(
      decodeSearch(
        { q: p.string() },
        source as unknown as Record<string, string>,
      ),
    ).toEqual({ q: "ok" });
  });

  it("non-string array elements under a declared key are a ParamourError", () => {
    expect(() =>
      decodeSearch({ q: p.string() }, { q: [5] } as unknown as Record<
        string,
        string[]
      >),
    ).toThrow(ParamourError);
    expect(() =>
      decodeSearch({ tag: p.stringArray() }, {
        tag: [5, true],
      } as unknown as Record<string, string[]>),
    ).toThrow(ParamourError);
  });

  it("non-string source array elements stay loud through .catch()", () => {
    expect(() =>
      decodeSearch({ q: p.string().catch("fb") }, { q: [5] } as unknown as {
        q: string[];
      }),
    ).toThrow(/must be strings/);
  });

  it("impure array index getters cannot smuggle junk past validation (copy is validated, copy is used)", () => {
    let reads = 0;
    const tampered: string[] = [];
    Object.defineProperty(tampered, "0", {
      get: (): number | string => (reads++ === 0 ? "x" : 42),
    });
    expect(decodeSearch({ tag: p.stringArray() }, { tag: tampered })).toEqual({
      tag: ["x"],
    });
  });

  it("user code mutating the source mid-decode cannot change later keys' reads", () => {
    const source: Record<string, string> = { a: "1", b: "2" };
    const sneaky = p.custom<string>({
      parse: (raw) => {
        source.b = "999";
        return raw;
      },
      serialize: (value) => value,
    });
    expect(decodeSearch({ a: sneaky, b: p.string() }, source)).toEqual({
      a: "1",
      b: "2",
    });
  });

  it("a URLSearchParams subclass yielding non-string values is a loud ParamourError, not a silent key drop", () => {
    const lying = new URLSearchParams("q=x");
    Object.defineProperty(lying, Symbol.iterator, {
      value: function* (): Generator<readonly [string, undefined]> {
        yield ["q", undefined];
      },
    });
    expect(() => decodeSearch({ q: p.string() }, lying)).toThrow(ParamourError);
    expect(() => decodeSearch({ q: p.string() }, lying)).toThrow(
      /must be strings/,
    );
  });

  it("issues aggregate across keys", () => {
    let caught: unknown;
    try {
      decodeSearch(
        { on: p.boolean(), page: p.integer() },
        { on: "yes", page: "x" },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SearchDecodeError);
    expect(
      (caught as SearchDecodeError).issues.map((issue) => issue.key).sort(),
    ).toEqual(["on", "page"]);
  });

  it("required key missing at encode time is an error", () => {
    expect(() =>
      encodeSearch({ q: p.string() }, {} as unknown as { q: string }),
    ).toThrow(SerializeError);
  });
});

describe("error contract — every throw is a ParamourError", () => {
  it("non-array input for an array codec is a SerializeError", () => {
    expect(() =>
      encodeSearch(
        { tag: p.stringArray() },
        { tag: null as unknown as string[] },
      ),
    ).toThrow(SerializeError);
  });

  it("malformed source values are a ParamourError, not a raw TypeError", () => {
    expect(() =>
      decodeSearch({ page: p.integer() }, { page: 5 } as unknown as Record<
        string,
        string
      >),
    ).toThrow(ParamourError);
    expect(() =>
      decodeSearch({ page: p.integer() }, { page: null } as unknown as Record<
        string,
        string
      >),
    ).toThrow(ParamourError);
  });

  it("a missing config (hand-built route lacking ~search) is a ParamourError at both codecs", () => {
    // Cast to Record<never, never> rather than `never` itself: `never` would
    // make encodeSearch's second parameter type (SearchInputOf<S>, a
    // distributive conditional) collapse to `never` too, since distributing
    // a conditional type over `never` yields `never` — an unrelated type-level
    // gotcha, not something this runtime-guard test means to exercise.
    expect(() =>
      encodeSearch(undefined as unknown as Record<never, never>, {}),
    ).toThrow(ParamourError);
    expect(() =>
      encodeSearch(undefined as unknown as Record<never, never>, {}),
    ).toThrow(/search config must be an object, got undefined/);
    expect(() => decodeSearch(undefined as never, {})).toThrow(ParamourError);
    expect(() => decodeSearch(undefined as never, {})).toThrow(
      /search config must be an object, got undefined/,
    );
  });

  it("a custom codec throwing a plain Error is recovered by .catch()", () => {
    const codec = p
      .custom<string>({
        parse() {
          throw new Error("bad");
        },
        serialize: (value) => value,
      })
      .catch("fallback");
    expect(decodeSearch({ x: codec }, { x: "v" })).toEqual({ x: "fallback" });
  });

  it("a custom codec throwing a plain Error aggregates as an issue", () => {
    const codec = p.custom<string>({
      parse() {
        throw new Error("bad");
      },
      serialize: (value) => value,
    });
    expect(() => decodeSearch({ x: codec }, { x: "v" })).toThrow(
      SearchDecodeError,
    );
  });

  it("a custom codec throwing a plain Error at serialize is a SerializeError", () => {
    const codec = p.custom<string>({
      parse: (raw) => raw,
      serialize() {
        throw new RangeError("Invalid time value");
      },
    });
    expect(() => encodeSearch({ x: codec }, { x: "v" })).toThrow(
      SerializeError,
    );
    expect(() => encodeSearch({ x: codec }, { x: "v" })).toThrow(
      "Invalid time value",
    );
  });

  it("a custom serialize returning a non-string is a loud SerializeError, never a dropped param", () => {
    const lookup = new Map<string, string>();
    const codec = p.custom<string>({
      parse: (raw) => raw,
      serialize: (value) => lookup.get(value) as unknown as string,
    });
    expect(() => encodeSearch({ q: codec }, { q: "miss" })).toThrow(
      SerializeError,
    );
    expect(() => encodeSearch({ q: codec }, { q: "miss" })).toThrow(
      /must return a string/,
    );
  });

  it("a custom parse throwing an unstringifiable value is still recovered by .catch()", () => {
    const impl = {
      parse(): string {
        // An unstringifiable throw (no usable primitive conversion) is the point.
        throw Object.create(null);
      },
      serialize: (value: string) => value,
    };
    expect(
      decodeSearch({ x: p.custom<string>(impl).catch("fallback") }, { x: "v" }),
    ).toEqual({ x: "fallback" });
    // ...and aggregates as an issue without .catch().
    expect(() =>
      decodeSearch({ x: p.custom<string>(impl) }, { x: "v" }),
    ).toThrow(SearchDecodeError);
  });

  it("a SerializeError from a custom parse stays loud through .catch()", () => {
    const codec = p
      .custom<string>({
        parse() {
          throw new SerializeError("canonicalization failed");
        },
        serialize: (value) => value,
      })
      .catch("fallback");
    expect(() => decodeSearch({ x: codec }, { x: "v" })).toThrow(
      SerializeError,
    );
    expect(() => decodeSearch({ x: codec }, { x: "v" })).toThrow(
      "canonicalization failed",
    );
  });

  it("null or non-object encode input is a loud SerializeError, not all-absent", () => {
    const config = { q: p.string().optional() };
    expect(() =>
      encodeSearch(config, null as unknown as InferSearchInput<typeof config>),
    ).toThrow(SerializeError);
    expect(() =>
      encodeSearch(
        config,
        undefined as unknown as InferSearchInput<typeof config>,
      ),
    ).toThrow(SerializeError);
  });

  it("null decode source is a loud ParamourError, not a raw TypeError", () => {
    expect(() =>
      decodeSearch(
        { q: p.string() },
        null as unknown as Record<string, string>,
      ),
    ).toThrow(ParamourError);
  });

  it("a ParamourError from a custom parse stays loud through .catch()", () => {
    const codec = p
      .custom<string>({
        parse() {
          throw new ParamourError("config-level failure");
        },
        serialize: (value) => value,
      })
      .catch("fallback");
    expect(() => decodeSearch({ x: codec }, { x: "v" })).toThrow(
      "config-level failure",
    );
  });

  it("null-prototype values fail serialize with SerializeError, not a raw TypeError", () => {
    const nullProto: unknown = Object.create(null);
    expect(() =>
      encodeSearch({ flag: p.boolean() }, { flag: nullProto as boolean }),
    ).toThrow(SerializeError);
    expect(() =>
      encodeSearch({ sort: p.enum(["a", "b"]) }, { sort: nullProto as "a" }),
    ).toThrow(SerializeError);
    expect(() =>
      encodeSearch({ page: p.number() }, { page: nullProto as number }),
    ).toThrow(SerializeError);
  });
});

describe("prototype-chain hygiene", () => {
  it("config keys colliding with Object.prototype members are not seen as present", () => {
    // The casts are the point: at runtime `{}` still *inherits* constructor
    // and toString, which a bare `values[key]` read would pick up.
    const ctorConfig = { constructor: p.string().optional() };
    expect(
      encodeSearch(ctorConfig, {} as InferSearchInput<typeof ctorConfig>),
    ).toEqual([]);
    const toStringConfig = { toString: p.string().optional() };
    expect(
      encodeSearch(
        toStringConfig,
        {} as InferSearchInput<typeof toStringConfig>,
      ),
    ).toEqual([]);
  });

  it("class instances exposing values via prototype getters encode", () => {
    const config = { page: p.integer(), q: p.string().optional() };
    // Literal getters, not readonly fields: values living on the class
    // PROTOTYPE (not as own properties) are exactly what this test pins.
    /* eslint-disable @typescript-eslint/class-literal-property-style */
    class Filters {
      get page() {
        return 3;
      }
      get q() {
        return "hi";
      }
    }
    /* eslint-enable @typescript-eslint/class-literal-property-style */
    expect(encodeSearch(config, new Filters())).toEqual([
      ["page", "3"],
      ["q", "hi"],
    ]);
  });

  it("class methods and constructor are not present input values", () => {
    const config = {
      page: p.integer(),
      sort: p.enum(["asc", "desc"]).optional(),
    };
    /* eslint-disable @typescript-eslint/class-literal-property-style */
    class Filters {
      get page() {
        return 3;
      }
      sort() {
        return "a method, not a value";
      }
    }
    /* eslint-enable @typescript-eslint/class-literal-property-style */
    expect(
      encodeSearch(
        config,
        new Filters() as unknown as InferSearchInput<typeof config>,
      ),
    ).toEqual([["page", "3"]]);

    const ctorConfig = { constructor: p.string().optional() };
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- an instance with no own properties is the point
    class Plain {}
    expect(
      encodeSearch(
        ctorConfig,
        new Plain() as unknown as InferSearchInput<typeof ctorConfig>,
      ),
    ).toEqual([]);
  });

  it("a throwing prototype getter surfaces as a SerializeError, not a raw foreign error", () => {
    class Boom {
      get page(): number {
        throw new RangeError("store not hydrated");
      }
    }
    expect(() => encodeSearch({ page: p.integer() }, new Boom())).toThrow(
      SerializeError,
    );
    expect(() => encodeSearch({ page: p.integer() }, new Boom())).toThrow(
      "store not hydrated",
    );
  });

  it("cross-realm inputs do not surface their realm's Object.prototype members", () => {
    const config = { constructor: p.string().optional(), q: p.string() };
    const foreign = runInNewContext("({ q: 'hi' })") as InferSearchInput<
      typeof config
    >;
    expect(encodeSearch(config, foreign)).toEqual([["q", "hi"]]);
  });

  it("a __proto__ config key decodes to an own property", () => {
    const config = { ["__proto__"]: p.string() };
    const result = decodeSearch(config, new URLSearchParams("__proto__=x"));
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe(
      "x",
    );
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});

describe("output-shape invariants (D4)", () => {
  it("a structurally-built defaulted codec without a default value still yields its key", () => {
    // Unreachable via the public builders (.default() always stores a thunk),
    // but the exported Codec interface type-permits the combination; the
    // every-declared-key-present promise must hold regardless.
    const codec = {
      "~arity": "single",
      "~catchValue": undefined,
      "~caught": false,
      "~defaultElides": false,
      "~defaultValue": undefined,
      "~parseElement": (raw: string) => raw,
      "~presence": "defaulted",
      "~serializeElement": (value: unknown) => String(value),
    } as unknown as Codec<string, "defaulted">;
    const result = decodeSearch({ k: codec }, {});
    expect(Object.hasOwn(result, "k")).toBe(true);
    expect(result.k).toBeUndefined();
  });
});

describe("default and catch value isolation", () => {
  it("factory defaults yield a fresh value per decode", () => {
    const schema = z.object({ a: z.number() });
    const config = { f: p.json(schema).default(() => ({ a: 1 })) };
    const first = decodeSearch(config, {});
    const second = decodeSearch(config, {});
    expect(first.f).toEqual({ a: 1 });
    expect(first.f).not.toBe(second.f);
    first.f.a = 999;
    expect(decodeSearch(config, {}).f).toEqual({ a: 1 });
  });

  it("factory catch values apply on parse failure", () => {
    const config = { page: p.integer().catch(() => 1) };
    expect(decodeSearch(config, { page: "x" })).toEqual({ page: 1 });
  });

  it("factory defaults are excluded from D8 elision (a time-varying factory must not swallow explicit values)", () => {
    const config = { page: p.integer().default(() => 1) };
    expect(searchToString(config, { page: 1 })).toBe("?page=1");
    expect(searchToString(config, { page: 2 })).toBe("?page=2");
    expect(searchToString(config, {})).toBe("");
  });

  it("encode output is deterministic under a time-varying factory default", () => {
    let n = 1;
    const config = { page: p.integer().default(() => ++n) };
    expect(searchToString(config, { page: 2 })).toBe("?page=2");
    expect(searchToString(config, { page: 2 })).toBe("?page=2");
  });

  it("a throwing .default() factory surfaces as a ParamourError", () => {
    const config = {
      page: p.integer().default((): number => {
        throw new Error("boom");
      }),
    };
    expect(() => decodeSearch(config, {})).toThrow(ParamourError);
    expect(() => decodeSearch(config, {})).toThrow(
      /\.default\(\) factory threw/,
    );
  });

  it("a throwing .catch() factory surfaces as a ParamourError", () => {
    const config = {
      page: p.integer().catch((): number => {
        throw new Error("boom");
      }),
    };
    expect(() => decodeSearch(config, { page: "x" })).toThrow(
      /\.catch\(\) factory threw/,
    );
  });

  it("a .catch() factory throwing ParseError is branded as a config-side failure, not passed through raw", () => {
    const config = {
      page: p.integer().catch((): number => {
        throw new ParseError("nope");
      }),
    };
    let caught: unknown;
    try {
      decodeSearch(config, { page: "x" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParamourError);
    expect(caught).not.toBeInstanceOf(ParseError);
    expect((caught as Error).message).toMatch(
      /\.catch\(\) factory threw: nope/,
    );
  });
});

describe("S5 caveat — integer-like keys", () => {
  it("numeric-string keys enumerate first in ascending numeric order (documented deviation)", () => {
    // eslint-disable-next-line perfectionist/sort-objects -- declaration order is the point
    const config = { page: p.string(), "0": p.string() };
    expect(encodeSearch(config, { 0: "b", page: "a" })).toEqual([
      ["0", "b"],
      ["page", "a"],
    ]);
  });
});
