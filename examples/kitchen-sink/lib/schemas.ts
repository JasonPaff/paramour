import { z } from "zod";

// Standard Schema validators (Zod v4 implements Standard Schema natively). The
// schema-accepting codecs — p.string/integer/number/json — and rawSearch all
// take any Standard Schema, so these plug straight in for extra refinement on
// top of each codec's wire grammar.

/** Refines p.integer() on the product `id` param: a positive whole number. */
export const positiveInt = z.number().int().positive();

/** Refines p.string() on the `q` search param: at least two characters. */
export const searchQuery = z.string().min(2);

/** Refines p.json() on the events `coords` param: a lat/lng pair. */
export const coords = z.object({ lat: z.number(), lng: z.number() });

// A single-or-repeated key collapses to string vs string[] on the raw-search
// path (readAllValues), so the whole-object schema must accept both forms.
const stringList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]));

/**
 * The whole-object schema behind /find's rawSearch escape hatch. Unlike a
 * codec map, the schema owns EVERY key (P8 does not apply): `page` arrives as a
 * string and is coerced, `tags` normalizes to an array, and unknown keys are
 * stripped by Zod. There is no per-key .default()/.catch() and no round-trip
 * encoding here — that is the rawSearch trade-off (SS7).
 */
export const findSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  tags: stringList.optional(),
});
