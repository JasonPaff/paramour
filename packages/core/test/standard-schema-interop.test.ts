/**
 * Cross-validator Standard Schema interop (DESIGN §12: "any Standard Schema v1
 * implementation; zod/valibot/arktype smoke-tested in CI").
 *
 * Every other suite reaches for zod. The library's premise is bring-your-own
 * validator, so the vendor-specific shapes the code actually depends on get
 * pinned here against the real packages rather than hand-rolled stand-ins:
 *
 * - `issue.path` segment form. The spec types it as
 *   `ReadonlyArray<PropertyKey | PathSegment>`. Zod and ArkType emit bare
 *   strings; Valibot emits `{ key, ... }` objects. `search.ts` (SS3/SS4) reads
 *   `.key` off the object form — `raw-search.test.ts` asserts that against a
 *   fake, this asserts it against Valibot itself.
 * - Root-level issues. Zod and ArkType emit `path: []`; Valibot omits `path`
 *   entirely. Both must collapse to the `<search>` sentinel.
 * - Async `validate`. Returning a Promise is spec-legal and paramour must
 *   reject it (design-02 D7), since URL parsing is synchronous.
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";

import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  decodeSearch,
  p,
  ParamourError,
  ParseError,
  rawSearch,
  SearchDecodeError,
  SerializeError,
} from "../src";

const parse = (
  codec: { "~parseElement": (raw: string) => unknown },
  raw: string,
) => codec["~parseElement"](raw);
const serialize = (
  codec: { "~serializeElement": (value: unknown) => string },
  value: unknown,
) => codec["~serializeElement"](value);

/**
 * One validator's spelling of the same handful of schemas. Typing the fields
 * as `StandardSchemaV1<In, Out>` is itself part of the test: if a vendor's
 * inferred in/out types stop lining up with what `p.string`/`p.integer`
 * demand, this file fails to compile.
 */
interface Adapter {
  /** Rejects strings shorter than 3 characters. */
  readonly minLength3: StandardSchemaV1<string, string>;
  /** `{ q: string }`, where a missing `q` yields a single keyed issue. */
  readonly missingKey: StandardSchemaV1;
  readonly name: string;
  /** Rejects numbers <= 0. */
  readonly positive: StandardSchemaV1<number, number>;
  /** An object schema whose whole-object check always fails (root issue). */
  readonly rootIssue: StandardSchemaV1;
  /** `{ q: string, page: <numeric string> }` decoding `page` to a number. */
  readonly searchOk: StandardSchemaV1;
  readonly vendor: string;
}

const adapters: readonly Adapter[] = [
  {
    minLength3: z.string().min(3),
    missingKey: z.object({ q: z.string() }),
    name: "zod",
    positive: z.number().positive(),
    rootIssue: z.object({ q: z.string() }).refine(() => false, "root failed"),
    searchOk: z.object({ page: z.coerce.number(), q: z.string() }),
    vendor: "zod",
  },
  {
    minLength3: v.pipe(v.string(), v.minLength(3)),
    missingKey: v.object({ q: v.string() }),
    name: "valibot",
    positive: v.pipe(v.number(), v.minValue(1)),
    rootIssue: v.pipe(
      v.object({ q: v.string() }),
      v.check(() => false, "root failed"),
    ),
    searchOk: v.object({
      page: v.pipe(v.string(), v.transform(Number)),
      q: v.string(),
    }),
    vendor: "valibot",
  },
  {
    minLength3: type("string >= 3"),
    missingKey: type({ q: "string" }),
    name: "arktype",
    positive: type("number > 0"),
    rootIssue: type({ q: "string" }).narrow(() => false),
    searchOk: type({ page: "string.numeric.parse", q: "string" }),
    vendor: "arktype",
  },
];

describe.each(adapters)("Standard Schema interop: $name", (adapter) => {
  it("advertises itself as a Standard Schema v1 implementation", () => {
    expect(adapter.minLength3["~standard"].version).toBe(1);
    expect(adapter.minLength3["~standard"].vendor).toBe(adapter.vendor);
  });

  it("refines a string codec on parse and on serialize", () => {
    const codec = p.string(adapter.minLength3);
    expect(parse(codec, "abcd")).toBe("abcd");
    expect(() => parse(codec, "ab")).toThrow(ParseError);
    // Serialize-side too: a schema-invalid value must fail at link-build time
    // rather than produce a URL that cannot be parsed back.
    expect(serialize(codec, "abcd")).toBe("abcd");
    expect(() => serialize(codec, "ab")).toThrow(SerializeError);
  });

  it("refines a numeric codec on parse and on serialize", () => {
    const codec = p.integer(adapter.positive);
    expect(parse(codec, "5")).toBe(5);
    expect(() => parse(codec, "-5")).toThrow(ParseError);
    expect(serialize(codec, 5)).toBe("5");
    expect(() => serialize(codec, -5)).toThrow(SerializeError);
  });

  it("validates a json codec's decoded payload", () => {
    const codec = p.json(adapter.missingKey);
    expect(parse(codec, '{"q":"hi"}')).toEqual({ q: "hi" });
    expect(() => parse(codec, "{}")).toThrow(ParseError);
  });

  it("decodes rawSearch through the vendor's own transforms", () => {
    expect(
      decodeSearch(rawSearch(adapter.searchOk), { page: "2", q: "hi" }),
    ).toEqual({ page: 2, q: "hi" });
  });

  it("maps a keyed issue to its key, whatever the vendor's path segment form", () => {
    // Zod/ArkType: path is ["q"]. Valibot: path is [{ key: "q", ... }].
    // Both must land on the bare key -- never "[object Object]" (SS3/SS4).
    try {
      decodeSearch(rawSearch(adapter.missingKey), {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SearchDecodeError);
      const { issues } = error as SearchDecodeError;
      expect(issues).toHaveLength(1);
      expect(issues.map((issue) => issue.key)).toEqual(["q"]);
      expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
    }
  });

  it("maps a root-level issue to the <search> sentinel", () => {
    // Zod/ArkType emit `path: []`; Valibot omits `path`. Both join to "".
    try {
      decodeSearch(rawSearch(adapter.rootIssue), { q: "hi" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SearchDecodeError);
      const { issues } = error as SearchDecodeError;
      expect(issues.map((issue) => issue.key)).toEqual(["<search>"]);
    }
  });
});

describe("vendor-owned arrays are never mapped in place", () => {
  /**
   * A `ReadonlyArray` may be an `Array` subclass. `Array.prototype.map` builds
   * its result through `Symbol.species` -- `new Subclass(len)` -- so a
   * subclass whose constructor is variadic (`constructor(...segments)`) turns
   * `map` over an EMPTY array into a one-element array holding the length.
   * This is exactly ArkType's `ReadonlyPath`; paramour must use `Array.from`.
   */
  class VariadicPath extends Array<PropertyKey> {
    constructor(...segments: PropertyKey[]) {
      super();
      this.push(...segments);
    }
  }

  it("reproduces the species hazard, so the guard below is meaningful", () => {
    const empty = new VariadicPath();
    expect(empty).toHaveLength(0);
    // The hazard: species-create runs `new VariadicPath(0)`, whose variadic
    // constructor stores the length 0 as an ELEMENT. The callback never fires
    // (the source is empty), so the phantom stays the raw number -- and a
    // later `.join(".")` turns it into the key "0".
    expect(empty.map((seg) => String(seg))).toEqual([0]);
    expect(empty.map((seg) => String(seg)).join(".")).toBe("0");
    // Array.from ignores species entirely.
    expect(Array.from(empty, (seg) => String(seg))).toEqual([]);
    expect(Array.from(empty, (seg) => String(seg)).join(".")).toBe("");
  });

  it("survives a hostile subclass for both the issues array and the path", () => {
    // `issues` and `path` are both variadic Array subclasses: the empty path
    // must still reach the <search> sentinel, and the single issue must not
    // gain a phantom sibling.
    const issues = new VariadicPath() as unknown as StandardSchemaV1.Issue[];
    issues.push({ message: "root failed", path: new VariadicPath() });

    const schema: StandardSchemaV1<unknown, never> = {
      "~standard": {
        validate: () => ({ issues }),
        vendor: "test",
        version: 1,
      },
    };

    try {
      decodeSearch(rawSearch(schema), {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SearchDecodeError);
      expect((error as SearchDecodeError).issues).toEqual([
        { key: "<search>", message: "root failed" },
      ]);
    }
  });
});

describe("async Standard Schema validation is rejected (design-02 D7)", () => {
  it("rejects a real async zod schema", () => {
    const schema = z.object({
      q: z.string().refine(() => Promise.resolve(true)),
    });
    expect(() => decodeSearch(rawSearch(schema), { q: "hi" })).toThrow(
      /Async Standard Schema validation is not supported/,
    );
  });

  it("rejects a real async valibot schema", () => {
    const schema = v.objectAsync({
      q: v.pipeAsync(
        v.string(),
        v.checkAsync(() => Promise.resolve(true)),
      ),
    });
    expect(() => decodeSearch(rawSearch(schema), { q: "hi" })).toThrow(
      /Async Standard Schema validation is not supported/,
    );
  });

  it("surfaces the async rejection as a ParamourError, not a foreign throw", () => {
    const schema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: () => Promise.resolve({ value: {} }),
        vendor: "test",
        version: 1,
      },
    };
    // rebrandForeign lets paramour's own errors through unwrapped: the async
    // guard must NOT be re-wrapped as "raw-search schema validation threw".
    try {
      decodeSearch(rawSearch(schema), {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ParamourError);
      expect((error as Error).message).not.toMatch(/schema validation threw/);
    }
  });

  it("rejects an async schema behind a p.* codec too", () => {
    // The rawSearch path wraps its runner in rebrandForeign; the p.* refine
    // path does not, so the async guard is exercised on both.
    const schema: StandardSchemaV1<string, string> = {
      "~standard": {
        validate: () => Promise.resolve({ value: "hi" }),
        vendor: "test",
        version: 1,
      },
    };
    expect(() => parse(p.string(schema), "hi")).toThrow(
      /Async Standard Schema validation is not supported/,
    );
  });
});
