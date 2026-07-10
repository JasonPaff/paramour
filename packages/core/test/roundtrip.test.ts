/**
 * Round-trip property tests (wire spec §6, DESIGN §11): for every codec and
 * valid value x, decode(platform-decode(encode(x))) ≅ x, honoring the three
 * §6 exceptions (-0 → 0; [] ≡ absent; Dates by instant / calendar day).
 * p.json / p.custom get deterministic coverage elsewhere (conformance C18,
 * codecs.test.ts), not arbitraries.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildPath,
  type Codec,
  decodeParams,
  defineAppRoute,
  href,
  p,
  type Route,
} from "../src";

// Serialize-side Date range (N8): years 0000–9999 only.
const dateArb = fc.date({
  max: new Date("9999-12-31T23:59:59.999Z"),
  min: new Date("0000-01-01T00:00:00.000Z"),
  noInvalidDate: true,
});

const integerArb = fc.oneof(fc.integer(), fc.maxSafeInteger());

/** Well-formed ASCII and full-unicode strings (lone surrogates throw, S7). */
const wireString = fc.oneof(fc.string(), fc.string({ unit: "grapheme" }));

/** Non-empty variant: "" is invalid as a segment value (R4). */
const segmentString = wireString.filter((value) => value !== "");

/** The path portion of an href (no fragment is emitted in these cases). */
const pathOf = (link: string): string => {
  const at = link.indexOf("?");
  return at === -1 ? link : link.slice(0, at);
};

/** Query half → Next-style searchParams record (repeats → string[]). */
const queryRecordOf = (link: string): Record<string, string | string[]> => {
  const record: Record<string, string | string[]> = {};
  const at = link.indexOf("?");
  if (at === -1) return record;
  const pairs = new URLSearchParams(link.slice(at + 1));
  for (const key of new Set(pairs.keys())) {
    const all = pairs.getAll(key);
    const [first] = all;
    record[key] = all.length === 1 && first !== undefined ? first : all;
  }
  return record;
};

/**
 * Models Next's params surface (wire spec R5): unlike search params, Next
 * splits the path into segments but hands them back percent-ENCODED (issues
 * #48058/#64952) — core's decodeParams owns the decode. So this splits on "/"
 * WITHOUT decoding; the "/"-as-%2F encoding keeps splitting element-safe.
 */
const simulateNextDecode = (builtPath: string): string[] =>
  builtPath === "/" ? [] : builtPath.slice(1).split("/");

/** decodeParams ∘ platform ∘ buildPath for the single-`[v]` routes. */
const roundtripV = <Out>(
  route: Route<"/x/[v]", { readonly v: Codec<Out> }, Record<never, never>>,
  value: Out,
): Out => {
  const [, segment] = simulateNextDecode(buildPath(route, { v: value }));
  return decodeParams(route, { v: segment ?? "" }).v;
};

describe("params round-trip: decodeParams ∘ platform ∘ encodeParams ≅ id", () => {
  it("p.string() through [v] (unicode, spaces, slashes)", () => {
    const route = defineAppRoute("/x/[v]", { params: { v: p.string() } });
    fc.assert(
      fc.property(segmentString, (value) => {
        expect(roundtripV(route, value)).toBe(value);
      }),
    );
  });

  it("p.integer() through [v], up to safe magnitudes", () => {
    const route = defineAppRoute("/x/[v]", { params: { v: p.integer() } });
    fc.assert(
      fc.property(integerArb, (value) => {
        expect(roundtripV(route, value)).toBe(value);
      }),
    );
  });

  it("p.number() through [v] — precision exact, -0 comes back as 0 (§6.1)", () => {
    const route = defineAppRoute("/x/[v]", { params: { v: p.number() } });
    fc.assert(
      fc.property(
        fc.double({ noDefaultInfinity: true, noNaN: true }),
        (value) => {
          const expected = Object.is(value, -0) ? 0 : value;
          expect(roundtripV(route, value)).toBe(expected);
        },
      ),
    );
  });

  it("p.boolean() and p.enum() through [v]", () => {
    const flags = defineAppRoute("/x/[v]", { params: { v: p.boolean() } });
    fc.assert(
      fc.property(fc.boolean(), (value) => {
        expect(roundtripV(flags, value)).toBe(value);
      }),
    );
    const sorts = defineAppRoute("/x/[v]", {
      params: { v: p.enum(["price", "rating"]) },
    });
    fc.assert(
      fc.property(fc.constantFrom("price", "rating"), (value) => {
        expect(roundtripV(sorts, value)).toBe(value);
      }),
    );
  });

  it("p.timestamp() round-trips by instant (§6.3)", () => {
    const route = defineAppRoute("/x/[v]", { params: { v: p.timestamp() } });
    fc.assert(
      fc.property(dateArb, (value) => {
        expect(roundtripV(route, value).getTime()).toBe(value.getTime());
      }),
    );
  });

  it("p.isoDate() round-trips by calendar day (§6.3)", () => {
    const route = defineAppRoute("/x/[v]", { params: { v: p.isoDate() } });
    fc.assert(
      fc.property(dateArb, (value) => {
        expect(roundtripV(route, value).toISOString().slice(0, 10)).toBe(
          value.toISOString().slice(0, 10),
        );
      }),
    );
  });

  it("catch-all elements round-trip element-wise, including / (R2)", () => {
    const route = defineAppRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    fc.assert(
      fc.property(fc.array(segmentString, { minLength: 1 }), (values) => {
        const segments = simulateNextDecode(buildPath(route, { seg: values }));
        expect(decodeParams(route, { seg: segments.slice(1) })).toStrictEqual({
          seg: values,
        });
      }),
    );
  });

  it("optional catch-all: [] elides and comes back as [] (§6.2 analog)", () => {
    const route = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    fc.assert(
      fc.property(fc.array(segmentString), (values) => {
        const segments = simulateNextDecode(buildPath(route, { slug: values }));
        // At the base path Next omits the key entirely — [] is the
        // canonical representative on the way back (D6).
        const source = segments.length > 1 ? { slug: segments.slice(1) } : {};
        expect(decodeParams(route, source)).toStrictEqual({ slug: values });
      }),
    );
  });
});

describe("dual property (§6): serialize ∘ parse ≅ id on canonical wire", () => {
  const parseWire = (codec: Codec<unknown>, raw: string): unknown =>
    codec["~parseElement"](raw);
  const serializeValue = (codec: Codec<unknown>, value: unknown): string =>
    codec["~serializeElement"](value);
  const reserialize = (codec: Codec<unknown>, raw: string): string =>
    serializeValue(codec, parseWire(codec, raw));

  it("canonical wire strings survive parse-then-serialize byte-identically", () => {
    const cases: [Codec<unknown>, string[]][] = [
      [p.string() as Codec<unknown>, ["", "hello", "a b", "é", "1e3"]],
      [
        p.integer() as Codec<unknown>,
        ["0", "2", "-17", "9007199254740991", "-9007199254740991"],
      ],
      [
        p.number() as Codec<unknown>,
        ["0", "1.5", "-2.25", "1e+21", "0.30000000000000004", "1e-7"],
      ],
      [p.boolean() as Codec<unknown>, ["true", "false"]],
      [p.enum(["price", "rating"]) as Codec<unknown>, ["price", "rating"]],
      [
        p.isoDate() as Codec<unknown>,
        ["2026-07-04", "0050-01-01", "2024-02-29", "9999-12-31"],
      ],
      [
        p.timestamp() as Codec<unknown>,
        ["2026-07-04T12:34:56.789Z", "0001-01-01T00:00:00.000Z"],
      ],
      [
        p.json(z.object({ a: z.number() })) as Codec<unknown>,
        ['{"a":1}', '{"a":0.5}'],
      ],
    ];
    for (const [codec, wires] of cases) {
      for (const wire of wires) {
        expect(reserialize(codec, wire)).toBe(wire);
      }
    }
  });

  it("fc: every canonical number/integer wire is a fixed point", () => {
    fc.assert(
      fc.property(fc.double({ noDefaultInfinity: true, noNaN: true }), (n) => {
        const wire = String(n === 0 ? 0 : n);
        expect(reserialize(p.number() as Codec<unknown>, wire)).toBe(wire);
      }),
    );
    fc.assert(
      fc.property(integerArb, (n) => {
        const wire = String(n === 0 ? 0 : n);
        expect(reserialize(p.integer() as Codec<unknown>, wire)).toBe(wire);
      }),
    );
  });

  it("non-canonical accepted inputs re-serialize to canonical form (normalizer, never error amplifier)", () => {
    const cases: [Codec<unknown>, string, string][] = [
      [p.integer() as Codec<unknown>, "007", "7"],
      [p.integer() as Codec<unknown>, "-0", "0"],
      [p.number() as Codec<unknown>, "2E3", "2000"],
      [p.number() as Codec<unknown>, "1.50", "1.5"],
      [p.number() as Codec<unknown>, "1e21", "1e+21"],
      [p.number() as Codec<unknown>, "-0", "0"],
      [
        p.timestamp() as Codec<unknown>,
        "2026-07-04T12:34:56Z",
        "2026-07-04T12:34:56.000Z",
      ],
      [
        p.timestamp() as Codec<unknown>,
        "2026-07-04T12:34:56.5Z",
        "2026-07-04T12:34:56.500Z",
      ],
      [
        p.json(z.object({ a: z.number() })) as Codec<unknown>,
        '{ "a" : 1 }',
        '{"a":1}',
      ],
    ];
    for (const [codec, accepted, canonical] of cases) {
      expect(reserialize(codec, accepted)).toBe(canonical);
      // The canonical form is a fixed point of a second pass.
      expect(reserialize(codec, canonical)).toBe(canonical);
    }
  });
});

describe("full loop: parse ∘ href ≅ id", () => {
  it("params + mixed-presence search survive the whole wire (§6)", async () => {
    const route = defineAppRoute("/shop/[cat]", {
      params: { cat: p.string() },
      search: {
        flag: p.boolean().optional(),
        n: p.integer().default(5),
        q: p.string(),
        tags: p.stringArray(),
      },
    });
    await fc.assert(
      fc.asyncProperty(
        segmentString,
        wireString,
        fc.integer(),
        fc.option(fc.boolean(), { nil: undefined }),
        fc.array(wireString),
        async (cat, q, n, flag, tags) => {
          const link = href(route, {
            params: { cat },
            // exactOptionalPropertyTypes: an absent optional key, never an
            // explicit undefined.
            search: { n, q, tags, ...(flag === undefined ? {} : { flag }) },
          });
          const [, catSegment] = simulateNextDecode(pathOf(link));
          const result = await route.parse({
            params: { cat: catSegment ?? "" },
            searchParams: queryRecordOf(link),
          });
          expect(result.params).toStrictEqual({ cat });
          // n equal to its default is elided on the wire (D8) and restored
          // by the default on decode — same value either way.
          expect(result.search).toStrictEqual({ flag, n, q, tags });
        },
      ),
    );
  });
});
