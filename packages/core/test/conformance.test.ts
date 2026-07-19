/**
 * Wire-format conformance suite — one test per case in wire-format spec §7.
 */
import { parse as parseQuerystring } from "node:querystring";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Codec, InferSearchInput } from "../src";

import {
  buildPath,
  buildSearchString,
  decodeParams,
  decodeSearch,
  defineAppRoute,
  encodeParams,
  encodeSearch,
  encodeStaticParams,
  href,
  p,
  ParamourError,
  ParseError,
  rawSearch,
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
  it("C6/P5: duplicates on a scalar codec are a parse error, never disambiguated", () => {
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
    expect(decodeSearch({ tag: p.array() }, source)).toEqual({
      tag: ["a", "b", "a"],
    });
  });

  it("C11: absent decodes to []", () => {
    expect(decodeSearch({ tag: p.array() }, {})).toEqual({ tag: [] });
  });

  it("C12: a single occurrence decodes to a one-element array", () => {
    expect(decodeSearch({ tag: p.array() }, { tag: "a" })).toEqual({
      tag: ["a"],
    });
  });

  it("C15: serializing [] emits nothing", () => {
    expect(searchToString({ tag: p.array() }, { tag: [] })).toBe("");
  });

  it("S6: an omitted array key encodes to nothing (absent ≡ [])", () => {
    expect(searchToString({ tag: p.array() }, {})).toBe("");
  });
});

describe("typed repeated-key arrays (design-13 PP1)", () => {
  it("typed elements round-trip through repeated keys", () => {
    const config = { ids: p.array(p.integer()) };
    expect(searchToString(config, { ids: [1, 2] })).toBe("?ids=1&ids=2");
    expect(decodeSearch(config, new URLSearchParams("ids=1&ids=2"))).toEqual({
      ids: [1, 2],
    });
  });

  it("an element parse failure fails the key; the LIST's .catch() recovers", () => {
    expect(() =>
      decodeSearch(
        { ids: p.array(p.integer()) },
        new URLSearchParams("ids=1&ids=x"),
      ),
    ).toThrow(SearchDecodeError);
    expect(
      decodeSearch(
        { ids: p.array(p.integer()).catch([]) },
        new URLSearchParams("ids=1&ids=x"),
      ),
    ).toEqual({ ids: [] });
  });

  it("empty-array semantics are element-type-independent (S6/P6)", () => {
    const config = { ids: p.array(p.integer()) };
    expect(decodeSearch(config, {})).toEqual({ ids: [] });
    expect(searchToString(config, { ids: [] })).toBe("");
  });
});

describe("p.index (design-13 PP5)", () => {
  it("?page=1 decodes to index 0; index 0 encodes to ?page=1", () => {
    expect(decodeSearch({ page: p.index() }, { page: "1" })).toEqual({
      page: 0,
    });
    expect(searchToString({ page: p.index() }, { page: 0 })).toBe("?page=1");
  });

  it("PP5: the wire floor is recoverable via .catch(), like any malformed input", () => {
    expect(() => decodeSearch({ page: p.index() }, { page: "0" })).toThrow(
      SearchDecodeError,
    );
    expect(decodeSearch({ page: p.index().catch(0) }, { page: "0" })).toEqual({
      page: 0,
    });
  });

  it("D8: .default(0) elides the wire form page=1", () => {
    const config = { page: p.index().default(0) };
    expect(searchToString(config, { page: 0 })).toBe("");
    expect(searchToString(config, { page: 3 })).toBe("?page=4");
    expect(decodeSearch(config, {})).toEqual({ page: 0 });
  });
});

describe("csv lists (design-11)", () => {
  it("CV3: tags=a,b decodes to a two-element list", () => {
    expect(decodeSearch({ tags: p.csv() }, { tags: "a,b" })).toEqual({
      tags: ["a", "b"],
    });
    expect(decodeSearch({ tags: p.csv(p.integer()) }, { tags: "1,2" })).toEqual(
      { tags: [1, 2] },
    );
  });

  it("CV3: present-but-empty ?tags= decodes to []", () => {
    expect(decodeSearch({ tags: p.csv() }, { tags: "" })).toEqual({
      tags: [],
    });
  });

  it("CV3: an empty segment is a per-key issue, recoverable via .catch()", () => {
    expect(() => decodeSearch({ tags: p.csv() }, { tags: "a,,b" })).toThrow(
      SearchDecodeError,
    );
    expect(
      decodeSearch(
        { tags: p.csv().catch((): string[] => []) },
        { tags: "a,,b" },
      ),
    ).toEqual({ tags: [] });
    // D2: catch recovers failures, never absence — absent required still errors.
    expect(() =>
      decodeSearch({ tags: p.csv().catch((): string[] => []) }, {}),
    ).toThrow(SearchDecodeError);
  });

  it("CV5: absent under .default([]) and present-but-empty both reach []", () => {
    const config = { tags: p.csv().default([]) };
    expect(decodeSearch(config, {})).toEqual({ tags: [] });
    expect(decodeSearch(config, { tags: "" })).toEqual({ tags: [] });
  });

  it("CV5: .optional() reads absent as undefined, ?tags= as []", () => {
    const config = { tags: p.csv().optional() };
    expect(decodeSearch(config, {})).toEqual({ tags: undefined });
    expect(decodeSearch(config, { tags: "" })).toEqual({ tags: [] });
  });

  it("CV5/D8: mutating a decoded value-form default does not pollute later decodes or elision", () => {
    const config = { tags: p.csv().default([]) };
    const first = decodeSearch(config, {});
    first.tags.push("x");
    expect(decodeSearch(config, {})).toEqual({ tags: [] });
    // Elision still compares against the config's [] — the explicitly-set
    // value equal to the mutation must stay on the wire.
    expect(searchToString(config, { tags: ["x"] })).toBe("?tags=x");
  });

  it("CV5/D8: a list equal to its [] default is elided", () => {
    const config = { tags: p.csv().default([]) };
    expect(searchToString(config, { tags: [] })).toBe("");
    expect(searchToString(config, {})).toBe("");
    expect(searchToString(config, { tags: ["a"] })).toBe("?tags=a");
  });

  it("CV3/S3: [] on a required csv key emits tags= and round-trips", () => {
    const config = { tags: p.csv() };
    const wire = searchToString(config, { tags: [] });
    expect(wire).toBe("?tags=");
    expect(decodeSearch(config, new URLSearchParams(wire.slice(1)))).toEqual({
      tags: [],
    });
  });

  it("CV4: a comma-containing element is a SerializeError at link-build time", () => {
    expect(() => encodeSearch({ tags: p.csv() }, { tags: ["a,b"] })).toThrow(
      SerializeError,
    );
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

  it("S4: the bare-key form is never emitted — an empty value still gets its =", () => {
    expect(buildSearchString([["flag", ""]])).toBe("?flag=");
  });

  it("S2: keys are encoded too, not just values", () => {
    expect(buildSearchString([["a b", "c"]])).toBe("?a%20b=c");
  });

  it("S7: a lone surrogate in a KEY is a serialization error", () => {
    expect(() => buildSearchString([["\uD800", "x"]])).toThrow(SerializeError);
  });

  it("S8: no unicode normalization — NFC and NFD are distinct values that round-trip distinctly", () => {
    const nfc = "\u00e9"; // e-acute as one code point
    const nfd = "e\u0301"; // e + combining acute
    const nfcWire = searchToString({ q: p.string() }, { q: nfc });
    const nfdWire = searchToString({ q: p.string() }, { q: nfd });
    expect(nfcWire).not.toBe(nfdWire);
    expect(
      decodeSearch({ q: p.string() }, new URLSearchParams(nfcWire.slice(1))),
    ).toEqual({ q: nfc });
    expect(
      decodeSearch({ q: p.string() }, new URLSearchParams(nfdWire.slice(1))),
    ).toEqual({ q: nfd });
  });

  it("P9: semicolons are not separators — a=1;b=2 is one pair", () => {
    expect(
      decodeSearch({ a: p.string() }, new URLSearchParams("a=1;b=2")),
    ).toEqual({ a: "1;b=2" });
  });
});

/**
 * The `+` character (P2 / design-06 §7). Empirical result: Next's two query
 * layers AGREE — the Pages Router's `router.query` (node `querystring.parse`
 * server-side) and `URLSearchParams` (client-side, and the App Router's
 * `useSearchParams`) both decode `+` as a space. There is no
 * router-vs-platform divergence; the layer that does NOT translate is plain
 * `decodeURIComponent`, which is why paramour emits `%20`/`%2B` and never
 * `+` (S1/C14): its URLs mean the same thing under either interpretation.
 * The value layer never re-interprets (P2), so an OBJECT source keeps a
 * literal `+` — the same wire text yields different values depending on
 * which layer already decoded it.
 */
describe("the + character (P2 / design-06 §7)", () => {
  it("C21: hand-typed q=a+b decodes as a space through both of Next's layers", () => {
    // Client layer (URLSearchParams — what decodeSearch consumes directly).
    expect(
      decodeSearch({ q: p.string() }, new URLSearchParams("q=a+b")),
    ).toEqual({ q: "a b" });
    // Server layer (router.query is node querystring.parse over the URL):
    // pinned to agree, so a hand-typed link reads the same on both sides.
    expect(parseQuerystring("q=a+b")).toEqual({ q: "a b" });
  });

  it("C22: a literal + emits %2B and round-trips exactly", () => {
    const wire = searchToString({ q: p.string() }, { q: "a+b" });
    expect(wire).toBe("?q=a%2Bb");
    expect(
      decodeSearch({ q: p.string() }, new URLSearchParams(wire.slice(1))),
    ).toEqual({ q: "a+b" });
  });

  it("C23: an object source is value-layer — + is never re-interpreted (P2)", () => {
    // Next hands searchParams/query values already decoded; by the time a
    // `+` survives to the value layer it IS a plus sign.
    expect(decodeSearch({ q: p.string() }, { q: "a+b" })).toEqual({
      q: "a+b",
    });
  });
});

describe("route param segments", () => {
  it('C16: serializing "" into [id] is a serialization error (R4)', () => {
    const route = defineAppRoute("/user/[id]", { params: { id: p.string() } });
    expect(() => buildPath(route, { id: "" })).toThrow(SerializeError);
    expect(() => encodeParams(route, { id: "" })).toThrow(SerializeError);
    // The static surface shares the R4 chokepoint.
    expect(() => encodeStaticParams(route, { id: "" })).toThrow(SerializeError);
  });

  it("C17: catch-all elements encode %2F and decode element-wise (R2/R5)", () => {
    const route = defineAppRoute("/[...slug]", {
      params: { slug: p.string() },
    });
    expect(buildPath(route, { slug: ["a/b", "c"] })).toBe("/a%2Fb/c");
    // Decode side: Next hands the params surface percent-ENCODED (R5, Next
    // #48058/#64952), so the %2F element arrives as one "a%2Fb" slot and core
    // restores "a/b" as a single element — the E2E pin against Next's own
    // segment-splitting is the residual of wire-spec open item 1.
    expect(decodeParams(route, { slug: ["a%2Fb", "c"] })).toEqual({
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
      decodeSearch({ tag: p.array() }, {
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
    expect(decodeSearch({ tag: p.array() }, { tag: tampered })).toEqual({
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

  it("D2: .catch() never recovers ABSENCE — a missing required search param stays an error", () => {
    // The search-side twin of path.test.ts's required-missing pin: catch
    // recovers parse failures only, absence is presence's job.
    expect(() => decodeSearch({ q: p.string().catch("fb") }, {})).toThrow(
      SearchDecodeError,
    );
    expect(() => decodeSearch({ q: p.string().catch("fb") }, {})).toThrow(
      /required search param is missing/,
    );
  });

  it("an explicit undefined under a declared key decodes as absent (Next's real record shape)", () => {
    expect(() => decodeSearch({ q: p.string() }, { q: undefined })).toThrow(
      /required search param is missing/,
    );
    expect(
      decodeSearch({ q: p.string().default("d") }, { q: undefined }),
    ).toEqual({ q: "d" });
    expect(decodeSearch({ tag: p.array() }, { tag: undefined })).toEqual({
      tag: [],
    });
  });

  it("an explicit undefined encode input for an optional key is omitted, never the text 'undefined'", () => {
    const config = { q: p.string().optional() };
    // No cast: InferSearchInput admits explicit undefined on omittable keys
    // — the type-level twin of the S3 omission this test pins.
    expect(encodeSearch(config, { q: undefined })).toEqual([]);
  });

  it("a failing array ELEMENT at encode time is a SerializeError", () => {
    expect(() =>
      encodeSearch({ tag: p.array() }, {
        tag: ["a", 5],
      } as unknown as { tag: string[] }),
    ).toThrow(SerializeError);
    expect(() =>
      encodeSearch({ tag: p.array() }, {
        tag: ["a", 5],
      } as unknown as { tag: string[] }),
    ).toThrow(/Expected a string/);
  });
});

describe("error contract — every throw is a ParamourError", () => {
  it("non-array input for an array codec is a SerializeError", () => {
    expect(() =>
      encodeSearch({ tag: p.array() }, { tag: null as unknown as string[] }),
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

  it("a __proto__ config key encodes from an own input property", () => {
    const config = { ["__proto__"]: p.string() };
    // JSON.parse is the one honest way to build an object whose OWN
    // "__proto__" key holds a value (an object literal would set the
    // prototype instead).
    const input = JSON.parse('{"__proto__":"x"}') as InferSearchInput<
      typeof config
    >;
    expect(encodeSearch(config, input)).toEqual([["__proto__", "x"]]);
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

  it("a .catch() factory throwing a non-ParseError ParamourError propagates unwrapped", () => {
    // toThunk's pass-through arm: config-side paramour errors stay loud
    // as themselves, never re-wrapped as ".catch() factory threw".
    const config = {
      page: p.integer().catch((): number => {
        throw new SerializeError("config-side failure");
      }),
    };
    let caught: unknown;
    try {
      decodeSearch(config, { page: "x" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SerializeError);
    expect((caught as Error).message).toBe("config-side failure");
  });

  it("a whole-array .catch() recovers a failing arity-many parse (contrast: element-wise in params)", () => {
    // No public builder makes a throwing arity-many codec; a structural
    // codec (the exported Codec interface permits it) exercises the many
    // branch of decodeSearch's shared recovery.
    const manyCaught = {
      "~arity": "many",
      "~catchValue": () => ["fallback"],
      "~caught": true,
      "~defaultElides": false,
      "~defaultValue": undefined,
      "~parseElement": (raw: string) => {
        if (raw === "boom") throw new ParseError("bad element");
        return raw;
      },
      "~presence": "required",
      "~serializeElement": (value: unknown) => String(value),
    } as unknown as Codec<string[], "required", true, "many">;
    expect(
      decodeSearch(
        { tag: manyCaught },
        new URLSearchParams("tag=a&tag=boom&tag=c"),
      ),
    ).toEqual({ tag: ["fallback"] });
    // Without the catch value, the whole key is one aggregated issue.
    const manyBare = {
      ...manyCaught,
      "~catchValue": undefined,
      "~caught": false,
    } as unknown as Codec<string[], "required", false, "many">;
    expect(() =>
      decodeSearch({ tag: manyBare }, new URLSearchParams("tag=boom")),
    ).toThrow(SearchDecodeError);
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

describe("href emission (S9/S10)", () => {
  it("S9: only schema-declared search params are emitted", () => {
    expect(
      encodeSearch({ q: p.string() }, { junk: "x", q: "a" } as unknown as {
        q: string;
      }),
    ).toEqual([["q", "a"]]);
  });

  it("S10: the fragment comes only from the explicit hash option, verbatim", () => {
    const about = defineAppRoute("/about", {});
    expect(href(about, { hash: "team" })).toBe("/about#team");
    expect(href(about, { hash: "" })).toBe("/about");
    // Verbatim means verbatim — the caller owns escaping.
    expect(href(about, { hash: "#top" })).toBe("/about##top");
  });
});

describe("rawSearch over the wire (design-04)", () => {
  it("SS3: the schema receives every key, collapsed to Next's searchParams shape", () => {
    const schema = z.object({ q: z.string(), tags: z.array(z.string()) });
    expect(
      decodeSearch(rawSearch(schema), new URLSearchParams("q=a&tags=x&tags=y")),
    ).toEqual({ q: "a", tags: ["x", "y"] });
  });

  it("SS4: schema issue paths become issue keys; a root-level issue keys as <search>", () => {
    let caught: unknown;
    try {
      decodeSearch(rawSearch(z.object({ n: z.number() })), { n: "2" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SearchDecodeError);
    expect(
      (caught as SearchDecodeError).issues.map((issue) => issue.key),
    ).toEqual(["n"]);

    let rootCaught: unknown;
    try {
      decodeSearch(rawSearch(z.string()), new URLSearchParams("q=hi"));
    } catch (error) {
      rootCaught = error;
    }
    expect(rootCaught).toBeInstanceOf(SearchDecodeError);
    expect(
      (rootCaught as SearchDecodeError).issues.map((issue) => issue.key),
    ).toEqual(["<search>"]);
  });

  it("SS5: encode is a raw pass-through — the schema never runs", () => {
    // A schema no input could satisfy: encode succeeding is the proof.
    const schema = z.object({ q: z.literal("never-run-on-encode") });
    expect(
      searchToString(rawSearch(schema), { q: "hi", tags: ["a", "b"] }),
    ).toBe("?q=hi&tags=a&tags=b");
  });
});

describe("catch-all element semantics (D6)", () => {
  it("D6: each failing element recovers independently through .catch()", () => {
    const files = defineAppRoute("/files/[...path]", {
      params: { path: p.integer().catch(0) },
    });
    expect(decodeParams(files, { path: ["1", "x", "3"] })).toEqual({
      path: [1, 0, 3],
    });
  });

  it("D6: an absent optional catch-all normalizes to []", () => {
    const docs = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    expect(decodeParams(docs, {})).toEqual({ slug: [] });
  });
});

describe("two list spellings (CV1/CV7)", () => {
  it("CV1: csv packs the list into ONE comma-separated wire value", () => {
    expect(searchToString({ tags: p.csv() }, { tags: ["a", "b"] })).toBe(
      "?tags=a%2Cb",
    );
  });

  it("CV7: p.array repeats the key instead — same value, two first-class spellings", () => {
    expect(searchToString({ tags: p.array() }, { tags: ["a", "b"] })).toBe(
      "?tags=a&tags=b",
    );
  });
});

describe("route segment shapes (R1/R3/R6)", () => {
  it("R1: a single param contributes exactly one encoded segment", () => {
    const user = defineAppRoute("/user/[id]", { params: { id: p.string() } });
    expect(buildPath(user, { id: "a b" })).toBe("/user/a%20b");
  });

  it("R3: an optional catch-all given [] or nothing elides to the base path", () => {
    const docs = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    expect(buildPath(docs, {})).toBe("/docs");
    expect(buildPath(docs, { slug: [] })).toBe("/docs");
  });

  it("R3: a required catch-all given [] is a SerializeError", () => {
    const files = defineAppRoute("/files/[...path]", {
      params: { path: p.string() },
    });
    expect(() => buildPath(files, { path: [] })).toThrow(SerializeError);
  });

  it('R6: the root route builds "/" and no href gains a trailing slash', () => {
    const root = defineAppRoute("/", {});
    expect(href(root)).toBe("/");
    const docs = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    expect(href(docs, { params: { slug: [] } })).toBe("/docs");
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
