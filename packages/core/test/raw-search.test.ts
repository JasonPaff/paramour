/**
 * Runtime tests for the `rawSearch` whole-object search escape hatch
 * (design-04, plan-04 step 6).
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  decodeSearch,
  defineRoute,
  encodeSearch,
  href,
  ParamourError,
  rawSearch,
  SearchDecodeError,
  SerializeError,
} from "../src";

/** Never fails; echoes back whatever record it's handed. */
function echoSchema(): StandardSchemaV1<
  Record<string, string | string[]>,
  Record<string, string | string[]>
> {
  return {
    "~standard": {
      validate: (value) => ({
        value: value as Record<string, string | string[]>,
      }),
      vendor: "test",
      version: 1,
    },
  };
}

describe("rawSearch decode (design-04 SS3/SS4)", () => {
  it("a successful validate returns the schema's own output", () => {
    const schema = z.object({
      page: z.coerce.number().optional(),
      q: z.string(),
    });
    const output = decodeSearch(rawSearch(schema), { page: "2", q: "hi" });
    expect(output).toEqual({ page: 2, q: "hi" });
  });

  it("a failed validate throws SearchDecodeError with mapped issues (nested-path join + no-path sentinel)", () => {
    const schema: StandardSchemaV1<unknown, never> = {
      "~standard": {
        validate: () => ({
          issues: [
            { message: "q is required" }, // no path -> "<search>" sentinel
            { message: "min must be a number", path: ["filters", "min"] },
          ],
        }),
        vendor: "test",
        version: 1,
      },
    };
    expect(() => decodeSearch(rawSearch(schema), {})).toThrow(
      SearchDecodeError,
    );
    try {
      decodeSearch(rawSearch(schema), {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SearchDecodeError);
      expect((error as SearchDecodeError).issues).toEqual([
        { key: "<search>", message: "q is required" },
        { key: "filters.min", message: "min must be a number" },
      ]);
    }
  });

  it("object-form PathSegments (Valibot's shape) join by their .key, not [object Object]", () => {
    const schema: StandardSchemaV1<unknown, never> = {
      "~standard": {
        validate: () => ({
          issues: [
            {
              message: "min must be a number",
              path: [{ key: "filters" }, { key: "min" }],
            },
          ],
        }),
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
        { key: "filters.min", message: "min must be a number" },
      ]);
    }
  });

  it("an empty path array (Zod's root-issue []) maps to the <search> sentinel, not an empty key", () => {
    const schema: StandardSchemaV1<unknown, never> = {
      "~standard": {
        validate: () => ({
          issues: [{ message: "at least one filter is required", path: [] }],
        }),
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
        { key: "<search>", message: "at least one filter is required" },
      ]);
    }
  });

  it("an async validate throws a clear ParamourError (D7/SS4)", () => {
    const asyncSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: (value) => Promise.resolve({ value }),
        vendor: "test",
        version: 1,
      },
    };
    expect(() => decodeSearch(rawSearch(asyncSchema), {})).toThrow(
      ParamourError,
    );
    expect(() => decodeSearch(rawSearch(asyncSchema), {})).toThrow(
      /synchronous/,
    );
  });

  it("a validate that THROWS (rather than returning issues) is rebranded, not a raw foreign error", () => {
    const throwingSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: () => {
          throw new Error("boom");
        },
        vendor: "test",
        version: 1,
      },
    };
    expect(() => decodeSearch(rawSearch(throwingSchema), {})).toThrow(
      ParamourError,
    );
    expect(() => decodeSearch(rawSearch(throwingSchema), {})).toThrow(/boom/);
    try {
      decodeSearch(rawSearch(throwingSchema), {});
      expect.unreachable();
    } catch (error) {
      // Rebranded, not the raw foreign Error passed through unchanged.
      expect(error).toBeInstanceOf(ParamourError);
      expect((error as Error).message).not.toBe("boom");
    }
  });

  it("unknown keys reach the schema — explicit P8 contrast with codec-map decode", () => {
    const output = decodeSearch(rawSearch(echoSchema()), {
      declaredNowhere: "still here",
      q: "hi",
    });
    expect(output).toEqual({ declaredNowhere: "still here", q: "hi" });
  });

  it("URLSearchParams and Next-record sources normalize to the identical schema input", () => {
    const params = new URLSearchParams();
    params.append("tag", "a");
    params.append("tag", "b");
    params.append("q", "hi");

    const fromParams = decodeSearch(rawSearch(echoSchema()), params);
    const fromRecord = decodeSearch(rawSearch(echoSchema()), {
      q: "hi",
      tag: ["a", "b"],
    });
    expect(fromParams).toEqual({ q: "hi", tag: ["a", "b"] });
    expect(fromParams).toEqual(fromRecord);
  });

  it("a __proto__-key source is safe (no prototype pollution)", () => {
    const source = JSON.parse('{"__proto__":"x","q":"hi"}') as Record<
      string,
      string
    >;
    const output = decodeSearch(rawSearch(echoSchema()), source) as Record<
      string,
      unknown
    >;
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
    expect(output.__proto__).toBe("x");
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
  });

  it("numeric PathSegments join like string ones (items.0)", () => {
    const schema: StandardSchemaV1<unknown, never> = {
      "~standard": {
        validate: () => ({
          issues: [{ message: "not a number", path: ["items", 0] }],
        }),
        vendor: "test",
        version: 1,
      },
    };
    try {
      decodeSearch(rawSearch(schema), {});
      expect.unreachable();
    } catch (error) {
      expect((error as SearchDecodeError).issues).toEqual([
        { key: "items.0", message: "not a number" },
      ]);
    }
  });

  it("a non-object source fails branded on the rawSearch path too", () => {
    expect(() => decodeSearch(rawSearch(echoSchema()), null as never)).toThrow(
      ParamourError,
    );
    expect(() => decodeSearch(rawSearch(echoSchema()), null as never)).toThrow(
      /search source must be an object/,
    );
  });

  it("a lying URLSearchParams subclass is a loud ParamourError on the rawSearch path", () => {
    const lying = new URLSearchParams("q=x");
    Object.defineProperty(lying, Symbol.iterator, {
      value: function* (): Generator<readonly [string, undefined]> {
        yield ["q", undefined];
      },
    });
    expect(() => decodeSearch(rawSearch(echoSchema()), lying)).toThrow(
      /must be strings/,
    );
  });

  it("non-string record values under any key fail loud before the schema runs", () => {
    let validateCalls = 0;
    const counting: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: (value) => {
          validateCalls++;
          return { value };
        },
        vendor: "test",
        version: 1,
      },
    };
    expect(() =>
      decodeSearch(rawSearch(counting), { q: 5 } as unknown as Record<
        string,
        string
      >),
    ).toThrow(ParamourError);
    expect(validateCalls).toBe(0);
  });

  it("an explicit-undefined record value is absent from the schema input", () => {
    const output = decodeSearch(rawSearch(echoSchema()), {
      gone: undefined,
      q: "hi",
    });
    expect(output).toEqual({ q: "hi" });
    expect(Object.hasOwn(output, "gone")).toBe(false);
  });
});

describe("rawSearch encode / href (design-04 SS5)", () => {
  it("emits a raw pass-through wire and never runs the schema on encode", () => {
    let validateCalls = 0;
    const countingSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: (value) => {
          validateCalls++;
          return { value };
        },
        vendor: "test",
        version: 1,
      },
    };
    const route = defineRoute("/search", {
      search: rawSearch(countingSchema),
    });
    const link = href(route, { search: { q: "a b", tag: ["x", "y"] } });
    expect(link).toBe("/search?q=a%20b&tag=x&tag=y");
    expect(validateCalls).toBe(0);
  });

  it("href builds a link without ever needing a decode-shaped value", () => {
    const route = defineRoute("/search", {
      search: rawSearch(z.object({ q: z.string() })),
    });
    // The encode-side value is already wire-shaped strings (SS5) — nothing
    // like the schema's parsed output (e.g. a coerced number) is required.
    const link = href(route, { search: { q: "hi" } });
    expect(link).toBe("/search?q=hi");
  });

  it("a non-string leaf is a SerializeError, not coerced (SS5 wire-value contract)", () => {
    const config = rawSearch(echoSchema());
    expect(() =>
      encodeSearch(config, { page: 1 } as unknown as Record<string, string>),
    ).toThrow(SerializeError);
    expect(() =>
      encodeSearch(config, { page: 1 } as unknown as Record<string, string>),
    ).toThrow(/expects a string or string\[\]/);
    expect(() =>
      encodeSearch(config, { tag: ["a", 2] } as unknown as Record<
        string,
        string[]
      >),
    ).toThrow(SerializeError);
  });

  it("an empty array and explicit undefined emit nothing", () => {
    const config = rawSearch(echoSchema());
    expect(encodeSearch(config, { q: "hi", tag: [] })).toEqual([["q", "hi"]]);
    expect(
      encodeSearch(config, { gone: undefined, q: "hi" } as unknown as Record<
        string,
        string
      >),
    ).toEqual([["q", "hi"]]);
  });

  it("a non-object encode input fails loud, not as all-absent", () => {
    const config = rawSearch(echoSchema());
    expect(() =>
      encodeSearch(config, null as unknown as Record<string, string>),
    ).toThrow(SerializeError);
    expect(() =>
      encodeSearch(config, null as unknown as Record<string, string>),
    ).toThrow(/must be an object/);
  });

  it("a throwing input getter is branded, not a raw foreign error", () => {
    const input = Object.defineProperty({}, "q", {
      enumerable: true,
      get(): string {
        throw new RangeError("store not hydrated");
      },
    }) as Record<string, string>;
    expect(() => encodeSearch(rawSearch(echoSchema()), input)).toThrow(
      SerializeError,
    );
    expect(() => encodeSearch(rawSearch(echoSchema()), input)).toThrow(
      "store not hydrated",
    );
  });

  it("a __proto__ input key encodes (own-key read, no prototype walk)", () => {
    const input = JSON.parse('{"__proto__":"x","q":"hi"}') as Record<
      string,
      string
    >;
    const pairs = encodeSearch(rawSearch(echoSchema()), input);
    expect(pairs).toContainEqual(["__proto__", "x"]);
    expect(pairs).toContainEqual(["q", "hi"]);
  });
});
