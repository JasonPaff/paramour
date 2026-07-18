import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type Codec,
  foreignMessage,
  p,
  ParamourError,
  ParseError,
  parseValue,
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

describe("p.integer", () => {
  it("parses and round-trips integers", () => {
    expect(parse(p.integer(), "2")).toBe(2);
    expect(parse(p.integer(), "-17")).toBe(-17);
    expect(serialize(p.integer(), 2)).toBe("2");
  });

  it("rejects non-integer grammars", () => {
    for (const raw of ["", "1e3", "1.0", "0x10", " 12", "12 ", "+5", "abc"]) {
      expect(() => parse(p.integer(), raw)).toThrow(ParseError);
    }
  });

  it("rejects unsafe magnitudes", () => {
    expect(() => parse(p.integer(), "9007199254740993")).toThrow(ParseError);
  });

  it("rejects non-integers at serialize time", () => {
    expect(() => serialize(p.integer(), 1.5)).toThrow(SerializeError);
    expect(() => serialize(p.integer(), Number.NaN)).toThrow(SerializeError);
  });

  it("rejects non-numbers at serialize time (no string coercion)", () => {
    expect(() => serialize(p.integer(), "5")).toThrow(SerializeError);
    expect(() => serialize(p.integer(), null)).toThrow(SerializeError);
  });

  it("accepts leading zeros and -0 on parse (grammar latitude, §4)", () => {
    expect(parse(p.integer(), "007")).toBe(7);
    expect(Object.is(parse(p.integer(), "-0"), -0)).toBe(true);
  });

  it("a normalizing schema whose output is not a safe integer fails serialize", () => {
    // StandardSchemaV1<number, number> by type, but returns a non-integer —
    // the post-refinement safe-integer check must still fire (N9).
    const halving: StandardSchemaV1<number, number> = {
      "~standard": {
        validate: (value) => ({ value: (value as number) / 2 }),
        vendor: "test",
        version: 1,
      },
    };
    expect(() => serialize(p.integer(halving), 3)).toThrow(SerializeError);
    expect(() => serialize(p.integer(halving), 3)).toThrow(
      /is not a safe integer/,
    );
  });
});

describe("p.number", () => {
  it("parses decimal and scientific notation", () => {
    expect(parse(p.number(), "1.5")).toBe(1.5);
    expect(parse(p.number(), "1e+21")).toBe(1e21);
    expect(parse(p.number(), "2E3")).toBe(2000);
  });

  it("round-trips exactly, including float artifacts", () => {
    const value = 0.1 + 0.2;
    expect(parse(p.number(), serialize(p.number(), value))).toBe(value);
    expect(parse(p.number(), serialize(p.number(), 1e21))).toBe(1e21);
  });

  it("rejects what Number() would sloppily accept", () => {
    for (const raw of ["0x10", "  12  ", "", ".5", "Infinity", "NaN"]) {
      expect(() => parse(p.number(), raw)).toThrow(ParseError);
    }
  });

  it("rejects non-finite values at serialize time", () => {
    expect(() => serialize(p.number(), Number.POSITIVE_INFINITY)).toThrow(
      SerializeError,
    );
  });

  it("canonicalizes -0 to 0", () => {
    expect(serialize(p.number(), -0)).toBe("0");
  });

  it("rejects grammar-valid text that overflows to Infinity", () => {
    // Passes NUMBER_RE but Number() yields ±Infinity — the post-regex
    // finiteness branch, distinct from the grammar rejection.
    for (const raw of ["1e400", "-1e309"]) {
      expect(() => parse(p.number(), raw)).toThrow(ParseError);
      expect(() => parse(p.number(), raw)).toThrow(/not a finite number/);
    }
  });

  it("accepts trailing zeros and leading zeros on parse (grammar latitude, §4)", () => {
    expect(parse(p.number(), "1.50")).toBe(1.5);
    expect(parse(p.number(), "007")).toBe(7);
  });
});

describe("p.boolean", () => {
  it("accepts only literal true/false", () => {
    expect(parse(p.boolean(), "true")).toBe(true);
    expect(parse(p.boolean(), "false")).toBe(false);
    for (const raw of ["TRUE", "1", "0", "yes", ""]) {
      expect(() => parse(p.boolean(), raw)).toThrow(ParseError);
    }
  });

  it("rejects non-booleans at serialize time (no truthy coercion)", () => {
    for (const value of [1, 0, "true", "false", null, {}]) {
      expect(() => serialize(p.boolean(), value)).toThrow(SerializeError);
    }
  });
});

describe("p.enum", () => {
  it("validates membership both directions", () => {
    const codec = p.enum(["price", "rating"]);
    expect(parse(codec, "price")).toBe("price");
    expect(() => parse(codec, "Price")).toThrow(ParseError);
    expect(serialize(codec, "rating")).toBe("rating");
    expect(() => serialize(codec, "stars")).toThrow(SerializeError);
  });
});

describe("p.isoDate", () => {
  it("round-trips calendar days at UTC midnight", () => {
    const date = parse(p.isoDate(), "2026-07-04") as Date;
    expect(date.toISOString()).toBe("2026-07-04T00:00:00.000Z");
    expect(serialize(p.isoDate(), date)).toBe("2026-07-04");
  });

  it("rejects malformed and impossible dates", () => {
    for (const raw of [
      "2026-2-3",
      "2026-02-30",
      "2026-13-01",
      "2026-07-04T00:00:00Z",
      "",
    ]) {
      expect(() => parse(p.isoDate(), raw)).toThrow(ParseError);
    }
  });

  it("handles years 0000-0099 (no Date.UTC two-digit-year quirk)", () => {
    const date = parse(p.isoDate(), "0050-01-01") as Date;
    expect(date.toISOString()).toBe("0050-01-01T00:00:00.000Z");
    expect(serialize(p.isoDate(), date)).toBe("0050-01-01");
  });

  it("rejects Dates outside years 0000-9999 at serialize time", () => {
    expect(() =>
      serialize(p.isoDate(), new Date(Date.UTC(10000, 0, 1))),
    ).toThrow(SerializeError);
    const negative = new Date(Date.UTC(2000, 0, 1));
    negative.setUTCFullYear(-1);
    expect(() => serialize(p.isoDate(), negative)).toThrow(SerializeError);
  });

  it("accepts real leap days", () => {
    const date = parse(p.isoDate(), "2024-02-29") as Date;
    expect(date.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(serialize(p.isoDate(), date)).toBe("2024-02-29");
  });

  it("rejects invalid Dates and non-Dates at serialize time", () => {
    expect(() => serialize(p.isoDate(), new Date(Number.NaN))).toThrow(
      SerializeError,
    );
    expect(() => serialize(p.isoDate(), new Date(Number.NaN))).toThrow(
      /Expected a valid Date/,
    );
    expect(() => serialize(p.isoDate(), "2026-01-01")).toThrow(SerializeError);
  });
});

describe("p.timestamp", () => {
  it("round-trips instants in toISOString form", () => {
    const instant = new Date("2026-07-04T12:34:56.789Z");
    const wire = serialize(p.timestamp(), instant);
    expect(wire).toBe("2026-07-04T12:34:56.789Z");
    expect((parse(p.timestamp(), wire) as Date).getTime()).toBe(
      instant.getTime(),
    );
  });

  it("tolerates missing milliseconds on parse", () => {
    expect(
      (parse(p.timestamp(), "2026-07-04T12:34:56Z") as Date).getTime(),
    ).toBe(Date.UTC(2026, 6, 4, 12, 34, 56));
  });

  it("rejects offsets, epochs, and invalid instants", () => {
    for (const raw of [
      "2026-07-04T12:34:56+02:00",
      "1720000000",
      "2026-07-04",
      "",
    ]) {
      expect(() => parse(p.timestamp(), raw)).toThrow(ParseError);
    }
  });

  it("rejects impossible calendar days the engine would normalize", () => {
    for (const raw of [
      "2024-02-30T12:00:00Z",
      "2023-02-29T00:00:00Z",
      "2024-04-31T00:00:00.500Z",
      "2024-01-01T24:00:00Z",
    ]) {
      expect(() => parse(p.timestamp(), raw)).toThrow(ParseError);
    }
  });

  it("rejects Dates outside years 0000-9999 at serialize time", () => {
    expect(() => serialize(p.timestamp(), new Date(8.64e15))).toThrow(
      SerializeError,
    );
    const negative = new Date(Date.UTC(2000, 0, 1));
    negative.setUTCFullYear(-1);
    expect(() => serialize(p.timestamp(), negative)).toThrow(SerializeError);
  });

  it("accepts 1- and 2-digit milliseconds, right-padded (canonicalization latitude)", () => {
    expect(
      (parse(p.timestamp(), "2026-07-04T12:34:56.5Z") as Date).getTime(),
    ).toBe(Date.UTC(2026, 6, 4, 12, 34, 56, 500));
    expect(
      (parse(p.timestamp(), "2026-07-04T12:34:56.55Z") as Date).getTime(),
    ).toBe(Date.UTC(2026, 6, 4, 12, 34, 56, 550));
  });

  it("rejects a lowercase z designator (strict grammar)", () => {
    expect(() => parse(p.timestamp(), "2026-07-04T12:34:56z")).toThrow(
      ParseError,
    );
  });

  it("rejects invalid Dates and non-Dates at serialize time", () => {
    expect(() => serialize(p.timestamp(), new Date(Number.NaN))).toThrow(
      SerializeError,
    );
    expect(() => serialize(p.timestamp(), 1720000000000)).toThrow(
      SerializeError,
    );
  });
});

describe("p.json", () => {
  const schema = z.object({ maxPrice: z.number() });

  it("parses JSON then validates via Standard Schema", () => {
    expect(parse(p.json(schema), '{"maxPrice":100}')).toEqual({
      maxPrice: 100,
    });
  });

  it("rejects invalid JSON and schema-rejected values", () => {
    expect(() => parse(p.json(schema), "{nope")).toThrow(ParseError);
    expect(() => parse(p.json(schema), '{"maxPrice":"high"}')).toThrow(
      ParseError,
    );
  });

  it("validates on serialize too", () => {
    expect(serialize(p.json(schema), { maxPrice: 100 })).toBe(
      '{"maxPrice":100}',
    );
    expect(() => serialize(p.json(schema), { maxPrice: "high" })).toThrow(
      SerializeError,
    );
  });

  it("emits the schema's normalized value, not the original", () => {
    const trimmed = z.object({ s: z.string().trim() });
    expect(serialize(p.json(trimmed), { s: " a " })).toBe('{"s":"a"}');
  });

  it("transforming (In≠Out) schemas are parse-only: serialize throws", () => {
    const transforming = z.object({ a: z.number() }).transform((o) => o.a);
    expect(parse(p.json(transforming), '{"a":1}')).toBe(1);
    expect(() => serialize(p.json(transforming), 1)).toThrow(SerializeError);
  });

  it("circular values are a SerializeError, not a raw TypeError", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serialize(p.json(z.any()), circular)).toThrow(SerializeError);
  });

  it("a schema output JSON.stringify maps to undefined is a SerializeError", () => {
    // lib.d.ts types stringify as always-string; undefined input is the
    // documented exception the explicit branch guards.
    expect(() => serialize(p.json(z.any()), undefined)).toThrow(SerializeError);
    expect(() => serialize(p.json(z.any()), undefined)).toThrow(
      /not JSON-serializable/,
    );
  });

  it("BigInt values are a SerializeError, not a raw TypeError", () => {
    expect(() => serialize(p.json(z.any()), 1n)).toThrow(SerializeError);
  });

  it("a throwing toJSON() is a SerializeError, not a raw foreign error", () => {
    const value = {
      toJSON(): never {
        throw new RangeError("boom");
      },
    };
    expect(() => serialize(p.json(z.any()), value)).toThrow(SerializeError);
  });
});

describe("Standard Schema refinements", () => {
  it("refines decoded values (zod)", () => {
    const codec = p.string(z.string().min(3));
    expect(parse(codec, "abcd")).toBe("abcd");
    expect(() => parse(codec, "ab")).toThrow(ParseError);

    const positive = p.integer(z.number().positive());
    expect(parse(positive, "5")).toBe(5);
    expect(() => parse(positive, "-5")).toThrow(ParseError);
  });

  it("runs the schema at serialize time too (no self-breaking URLs)", () => {
    const positive = p.integer(z.number().min(1));
    expect(serialize(positive, 5)).toBe("5");
    expect(() => serialize(positive, 0)).toThrow(SerializeError);

    const short = p.string(z.string().max(3));
    expect(() => serialize(short, "toolong")).toThrow(SerializeError);

    const bounded = p.number(z.number().max(10));
    expect(() => serialize(bounded, 11)).toThrow(SerializeError);
  });

  it("emits the schema's normalized value at serialize time", () => {
    const trimmed = p.string(z.string().trim());
    expect(serialize(trimmed, " a ")).toBe("a");
  });

  it("joins multiple schema issues into one message", () => {
    const twoIssues: StandardSchemaV1<string, string> = {
      "~standard": {
        validate: () => ({
          issues: [{ message: "too short" }, { message: "wrong shape" }],
        }),
        vendor: "test",
        version: 1,
      },
    };
    expect(() => parse(p.string(twoIssues), "x")).toThrow(
      "too short; wrong shape",
    );
    expect(() => serialize(p.string(twoIssues), "x")).toThrow(
      "too short; wrong shape",
    );
  });

  it("throws a clear error for async schemas", () => {
    const asyncSchema: StandardSchemaV1<string, string> = {
      "~standard": {
        validate: (value) => Promise.resolve({ value: value as string }),
        vendor: "test",
        version: 1,
      },
    };
    expect(() => parse(p.string(asyncSchema), "x")).toThrow(ParamourError);
    expect(() => parse(p.string(asyncSchema), "x")).toThrow(/synchronous/);
  });
});

describe("p.custom", () => {
  it("wraps user-defined bidirectional codecs", () => {
    const bigint = p.custom<bigint>({
      parse: (raw) => {
        if (!/^-?\d+$/.test(raw))
          throw new ParseError(`"${raw}" is not a bigint`);
        return BigInt(raw);
      },
      serialize: (value) => value.toString(),
    });
    expect(parse(bigint, "9007199254740993")).toBe(9007199254740993n);
    expect(serialize(bigint, 9007199254740993n)).toBe("9007199254740993");
  });

  it("wraps non-ParseError throws from parse in ParseError", () => {
    const codec = p.custom<string>({
      parse() {
        throw new Error("bad");
      },
      serialize: (value) => value,
    });
    expect(() => parse(codec, "x")).toThrow(ParseError);
    expect(() => parse(codec, "x")).toThrow("bad");
  });

  it("wraps non-Error primitive throws, preserving their text", () => {
    const codec = p.custom<string>({
      parse() {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a plain-JS throw is the point
        throw "oops";
      },
      serialize: (value) => value,
    });
    expect(() => parse(codec, "x")).toThrow(ParseError);
    expect(() => parse(codec, "x")).toThrow("oops");
  });
});

describe("p.csv", () => {
  it("parses comma-separated segments through the element codec", () => {
    expect(parse(p.csv(), "a,b")).toEqual(["a", "b"]);
    expect(parse(p.csv(p.integer()), "1,-2")).toEqual([1, -2]);
    expect(parse(p.csv(p.enum(["a", "b"])), "b,a")).toEqual(["b", "a"]);
    expect(parse(p.csv(), "solo")).toEqual(["solo"]);
  });

  it("CV3: the empty wire string decodes to []", () => {
    expect(parse(p.csv(), "")).toEqual([]);
    expect(parse(p.csv(p.integer()), "")).toEqual([]);
  });

  it("CV3: empty segments are parse errors, not filtered", () => {
    for (const raw of [",", "a,", ",a", "a,,b"]) {
      expect(() => parse(p.csv(), raw)).toThrow(ParseError);
      expect(() => parse(p.csv(), raw)).toThrow(/empty list element/);
    }
  });

  it("CV3: the first element failure aborts the list parse", () => {
    expect(() => parse(p.csv(p.integer()), "1,x,2")).toThrow(ParseError);
    expect(() => parse(p.csv(p.integer()), "1,x,2")).toThrow(
      /"x" is not an integer/,
    );
  });

  it("CV3: element order is preserved, duplicates kept (no dedupe)", () => {
    expect(parse(p.csv(), "b,a,b")).toEqual(["b", "a", "b"]);
  });

  it("serializes per element and joins with commas; [] is the empty string (CV5)", () => {
    expect(serialize(p.csv(p.integer()), [2, -3])).toBe("2,-3");
    expect(serialize(p.csv(), ["a", "b"])).toBe("a,b");
    expect(serialize(p.csv(), [])).toBe("");
  });

  it("CV4: a comma-containing element is a SerializeError", () => {
    expect(() => serialize(p.csv(), ["a,b"])).toThrow(SerializeError);
    expect(() => serialize(p.csv(), ["a,b"])).toThrow(/contains a comma/);
  });

  it('CV4: an empty-serializing element is a SerializeError ([""] is unrepresentable)', () => {
    expect(() => serialize(p.csv(), [""])).toThrow(SerializeError);
    expect(() => serialize(p.csv(), [""])).toThrow(/empty string/);
  });

  it("element serialize failures surface (no coercion)", () => {
    expect(() => serialize(p.csv(p.integer()), [1.5])).toThrow(SerializeError);
    expect(() => serialize(p.csv(), [1])).toThrow(SerializeError);
    expect(() => serialize(p.csv(), [1])).toThrow(/Expected a string/);
  });

  it("rejects non-array serialize input", () => {
    expect(() => serialize(p.csv(), "a,b")).toThrow(SerializeError);
    expect(() => serialize(p.csv(), "a,b")).toThrow(/Expected an array/);
  });

  it("CV2: a nested csv element is a construction-time ParamourError", () => {
    // A nested csv passes the type-level constraint (it is structurally an
    // unmodified single scalar) — the runtime guard is the backstop.
    expect(() => p.csv(p.csv())).toThrow(ParamourError);
    expect(() => p.csv(p.csv())).toThrow(/cannot themselves be csv lists/);
    expect(() => p.csv(p.csv(p.integer()))).toThrow(ParamourError);
  });

  it("CV2: nesting is detected structurally, not via the reflection label", () => {
    // ~kind is reflection metadata a p.custom label can set to anything —
    // a scalar labeled "csv" is a legal comma-free element, not a nested list.
    const labeled = p.custom<string>({
      label: "csv",
      parse: (raw) => raw,
      serialize: (value) => value,
    });
    expect(() => p.csv(labeled)).not.toThrow();
    expect(parse(p.csv(labeled), "a,b")).toEqual(["a", "b"]);
  });

  it("CV2: a modified element is a construction-time ParamourError (runtime mirror of the type-state)", () => {
    // Plain-JS consumers bypass the parameter type; only ~parseElement/
    // ~serializeElement are captured, so an accepted modifier would be
    // silently dropped (e.g. "1,x" throwing instead of recovering to [1, 0]).
    const modified: Codec<unknown>[] = [
      p.integer().catch(0) as unknown as Codec<unknown>,
      p.integer().default(1) as unknown as Codec<unknown>,
      p.integer().optional() as unknown as Codec<unknown>,
      p.stringArray() as unknown as Codec<unknown>,
    ];
    for (const inner of modified) {
      expect(() => p.csv(inner)).toThrow(ParamourError);
      expect(() => p.csv(inner)).toThrow(/cannot carry modifiers/);
    }
  });

  it("a non-string-returning custom element serializer is a SerializeError, not a TypeError", () => {
    // rebrandForeign wraps throws, not bad return values — the string
    // contract must be enforced before the CV4 guards consume the result.
    const broken = p.custom<unknown>({
      parse: (raw) => raw,
      serialize: () => undefined as unknown as string,
    });
    expect(() => serialize(p.csv(broken), ["a"])).toThrow(SerializeError);
    expect(() => serialize(p.csv(broken), ["a"])).toThrow(
      /must return a string/,
    );
  });

  it("round-trips per element kind", () => {
    const string = p.csv();
    expect(parse(string, serialize(string, ["x", "y z"]))).toEqual([
      "x",
      "y z",
    ]);

    const integer = p.csv(p.integer());
    expect(parse(integer, serialize(integer, [7, -12]))).toEqual([7, -12]);

    const dates = p.csv(p.isoDate());
    const wire = serialize(dates, [new Date(Date.UTC(2026, 6, 4))]);
    expect(wire).toBe("2026-07-04");
    expect((parse(dates, wire) as Date[]).map((d) => d.getTime())).toEqual([
      Date.UTC(2026, 6, 4),
    ]);

    const bigint = p.csv(
      p.custom<bigint>({
        parse: (raw) => {
          if (!/^-?\d+$/.test(raw))
            throw new ParseError(`"${raw}" is not a bigint`);
          return BigInt(raw);
        },
        serialize: (value) => value.toString(),
      }),
    );
    expect(parse(bigint, serialize(bigint, [9007199254740993n]))).toEqual([
      9007199254740993n,
    ]);
  });

  it(".default([]) pre-serializes cleanly; a comma-carrying default fails at define time", () => {
    expect(() => p.csv().default([])).not.toThrow();
    expect(() => p.csv().default(["a,b"])).toThrow(SerializeError);
  });
});

describe("p.string serialize contract", () => {
  it("rejects non-strings at serialize time", () => {
    expect(() => serialize(p.string(), 5)).toThrow(SerializeError);
    expect(() => serialize(p.string(), 5)).toThrow(/Expected a string/);
  });
});

describe("modifier runtime guards (JS consumers)", () => {
  it("rejects illegal chains at runtime", () => {
    const optional = p.string().optional() as unknown as {
      default: (v: string) => unknown;
      optional: () => unknown;
    };
    expect(() => optional.optional()).toThrow(ParamourError);
    expect(() => optional.default("x")).toThrow(ParamourError);

    const caught = p.integer().catch(0) as unknown as {
      catch: (v: number) => unknown;
    };
    expect(() => caught.catch(1)).toThrow(ParamourError);
  });

  it("builders are immutable — modifiers return new codecs", () => {
    const base = p.integer();
    const defaulted = base.default(1);
    expect(base["~presence"]).toBe("required");
    expect(defaulted["~presence"]).toBe("defaulted");
    expect(base["~defaultValue"]).toBeUndefined();
  });

  it("rejects presence modifiers on array codecs", () => {
    const arr = p.stringArray() as unknown as {
      default: (value: string[]) => unknown;
      optional: () => unknown;
    };
    expect(() => arr.default(["a"])).toThrow(ParamourError);
    expect(() => arr.optional()).toThrow(ParamourError);
  });

  it("~caught reflects catch state at runtime", () => {
    expect(p.integer()["~caught"]).toBe(false);
    expect(p.integer().catch(0)["~caught"]).toBe(true);
  });

  it("rejects a second .default() and .optional() after .default()", () => {
    const defaulted = p.integer().default(1) as unknown as {
      default: (value: number) => unknown;
      optional: () => unknown;
    };
    expect(() => defaulted.default(2)).toThrow(ParamourError);
    expect(() => defaulted.default(2)).toThrow(/after \.default\(\)/);
    expect(() => defaulted.optional()).toThrow(ParamourError);
    expect(() => defaulted.optional()).toThrow(/after \.default\(\)/);
  });

  it("a codec-invalid (not schema-invalid) value default fails at .default() time", () => {
    // 1.5 fails p.integer's own serialize contract with no schema involved —
    // the eager-validation twin of the schema-invalid conformance case.
    expect(() => p.integer().default(1.5)).toThrow(SerializeError);
    expect(() => p.integer().default(1.5)).toThrow(/not a safe integer/);
  });

  it(".catch() then .optional() composes both behaviors", () => {
    const codec = p.integer().catch(0).optional();
    expect(codec["~presence"]).toBe("optional");
    expect(codec["~caught"]).toBe(true);
  });
});

describe("parseValue", () => {
  it("parses one wire element through the codec", () => {
    expect(parseValue(p.integer(), "42")).toBe(42);
    expect(parseValue(p.boolean(), "true")).toBe(true);
  });

  it("throws ParseError WITHOUT applying .catch() (design-12 DT7)", () => {
    // The whole reason this exists: decodeSearch would recover this failure
    // to 0, making "parsed cleanly" and "failed but caught" indistinguishable.
    const caught = p.integer().catch(0);
    expect(() => parseValue(caught, "abc")).toThrow(ParseError);
  });

  it("parses a csv codec's whole comma-joined value (its element IS the list)", () => {
    expect(parseValue(p.csv(p.integer()), "1,2,3")).toEqual([1, 2, 3]);
  });
});

describe("foreignMessage", () => {
  it("renders Errors by message and survives unstringifiable values", () => {
    // Public via the barrel so derived tooling (the devtools panel's edit
    // preview) shares the String()-throw hardening: a null-prototype throw
    // makes String(value) itself throw a TypeError.
    expect(foreignMessage(new Error("boom"))).toBe("boom");
    expect(typeof foreignMessage(Object.create(null))).toBe("string");
  });
});
