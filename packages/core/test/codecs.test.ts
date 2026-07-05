import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { p, ParamourError, ParseError, SerializeError } from "../src";

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
});
