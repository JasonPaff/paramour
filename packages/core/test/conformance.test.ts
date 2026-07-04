/**
 * Wire-format conformance suite — one test per case in wire-format spec §7.
 * C16 and C17 concern route-param (path) serialization and land with the
 * path-building milestone.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SearchDecodeError, SerializeError } from "../src/errors.js";
import { p } from "../src/p.js";
import {
  buildSearchString,
  decodeSearch,
  encodeSearch,
  searchToString,
} from "../src/search.js";

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

  it("C20: a lone surrogate is a serialization error", () => {
    expect(() => buildSearchString([["q", "\uD800"]])).toThrow(URIError);
  });

  it("S3: only the empty string emits key=", () => {
    expect(searchToString({ q: p.string() }, { q: "" })).toBe("?q=");
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
});

describe("decode-side hygiene", () => {
  it("P8: unknown keys are ignored", () => {
    expect(decodeSearch({ q: p.string() }, { other: "x", q: "hi" })).toEqual({
      q: "hi",
    });
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
