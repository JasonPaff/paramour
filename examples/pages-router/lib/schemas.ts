import * as v from "valibot";

// Valibot implements Standard Schema natively (v1+). Kitchen-sink refines its
// codecs with Zod; this app makes the SAME two refinements with Valibot — the
// schema-accepting codecs take any Standard Schema, so the validator is
// interchangeable. One constraint: URL parsing must be synchronous, so only
// Valibot's sync API works here — pipeAsync/*Async actions are a documented
// runtime error (design-02 D7).

/** Refines p.integer() on the product `id` param: a positive whole number. */
export const positiveInt = v.pipe(v.number(), v.integer(), v.minValue(1));

/** Refines p.string() on the find `q` param: at least two characters. */
export const searchQuery = v.pipe(v.string(), v.minLength(2));
