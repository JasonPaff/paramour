import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ParamourError, ParseError, SerializeError } from "../src/errors.js";
import { p } from "../src/p.js";

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
});
