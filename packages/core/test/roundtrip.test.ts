/**
 * Round-trip property tests (wire spec §6, DESIGN §11): for every codec and
 * valid value x, decode(platform-decode(encode(x))) ≅ x, honoring the three
 * §6 exceptions (-0 → 0; [] ≡ absent; Dates by instant / calendar day).
 * p.json / p.custom get deterministic coverage elsewhere (conformance C18,
 * codecs.test.ts), not arbitraries.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildPath, decodeParams, defineRoute, href, p } from "../src";

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

/** The platform's byte-layer job (wire spec §1): percent-decode segments. */
const simulateNextDecode = (builtPath: string): string[] =>
  builtPath === "/"
    ? []
    : builtPath.slice(1).split("/").map(decodeURIComponent);

describe("params round-trip: decodeParams ∘ platform ∘ encodeParams ≅ id", () => {
  it("p.string() through [v] (unicode, spaces, slashes)", () => {
    const route = defineRoute("/x/[v]", { params: { v: p.string() } });
    fc.assert(
      fc.property(segmentString, (value) => {
        const [, segment] = simulateNextDecode(buildPath(route, { v: value }));
        expect(decodeParams(route, { v: segment ?? "" })).toStrictEqual({
          v: value,
        });
      }),
    );
  });

  it("p.integer() through [v], up to safe magnitudes", () => {
    const route = defineRoute("/x/[v]", { params: { v: p.integer() } });
    fc.assert(
      fc.property(integerArb, (value) => {
        const [, segment] = simulateNextDecode(buildPath(route, { v: value }));
        expect(decodeParams(route, { v: segment ?? "" }).v).toBe(value);
      }),
    );
  });

  it("p.number() through [v] — precision exact, -0 comes back as 0 (§6.1)", () => {
    const route = defineRoute("/x/[v]", { params: { v: p.number() } });
    fc.assert(
      fc.property(
        fc.double({ noDefaultInfinity: true, noNaN: true }),
        (value) => {
          const expected = Object.is(value, -0) ? 0 : value;
          const [, segment] = simulateNextDecode(
            buildPath(route, { v: value }),
          );
          expect(decodeParams(route, { v: segment ?? "" }).v).toBe(expected);
        },
      ),
    );
  });

  it("p.boolean() and p.enum() through [v]", () => {
    const flags = defineRoute("/x/[v]", { params: { v: p.boolean() } });
    fc.assert(
      fc.property(fc.boolean(), (value) => {
        const [, segment] = simulateNextDecode(buildPath(flags, { v: value }));
        expect(decodeParams(flags, { v: segment ?? "" }).v).toBe(value);
      }),
    );
    const sorts = defineRoute("/x/[v]", {
      params: { v: p.enum(["price", "rating"]) },
    });
    fc.assert(
      fc.property(fc.constantFrom("price", "rating"), (value) => {
        const [, segment] = simulateNextDecode(buildPath(sorts, { v: value }));
        expect(decodeParams(sorts, { v: segment ?? "" }).v).toBe(value);
      }),
    );
  });

  it("p.timestamp() round-trips by instant (§6.3)", () => {
    const route = defineRoute("/x/[v]", { params: { v: p.timestamp() } });
    fc.assert(
      fc.property(dateArb, (value) => {
        const [, segment] = simulateNextDecode(buildPath(route, { v: value }));
        expect(decodeParams(route, { v: segment ?? "" }).v.getTime()).toBe(
          value.getTime(),
        );
      }),
    );
  });

  it("p.isoDate() round-trips by calendar day (§6.3)", () => {
    const route = defineRoute("/x/[v]", { params: { v: p.isoDate() } });
    fc.assert(
      fc.property(dateArb, (value) => {
        const [, segment] = simulateNextDecode(buildPath(route, { v: value }));
        expect(
          decodeParams(route, { v: segment ?? "" })
            .v.toISOString()
            .slice(0, 10),
        ).toBe(value.toISOString().slice(0, 10));
      }),
    );
  });

  it("catch-all elements round-trip element-wise, including / (R2)", () => {
    const route = defineRoute("/files/[...seg]", {
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
    const route = defineRoute("/docs/[[...path]]", {
      params: { path: p.string() },
    });
    fc.assert(
      fc.property(fc.array(segmentString), (values) => {
        const segments = simulateNextDecode(buildPath(route, { path: values }));
        // At the base path Next omits the key entirely — [] is the
        // canonical representative on the way back (D6).
        const source = segments.length > 1 ? { path: segments.slice(1) } : {};
        expect(decodeParams(route, source)).toStrictEqual({ path: values });
      }),
    );
  });
});

describe("full loop: parse ∘ href ≅ id", () => {
  it("params + mixed-presence search survive the whole wire (§6)", async () => {
    const route = defineRoute("/shop/[cat]", {
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
