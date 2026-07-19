import { z } from "zod";

/**
 * The explorer's URL-state descriptor (plan-docs-milestone-5 B1/B2).
 *
 * The whole explorer — composed config, encode-pane inputs, decode-pane query
 * — is one JSON value carried by a single `p.json(explorerStateSchema)` search
 * param, so a shared link reproduces exactly what the sharer saw (decision 8).
 *
 * Modifier values (`.default()` / `.catch()`) and encode inputs are stored as
 * WIRE-FORM STRINGS and parsed through the described codec itself
 * (build-config.ts) — the explorer never invents a second value syntax.
 *
 * Illegal combinations the type-state API forbids at compile time are
 * prevented structurally here: the `array` arm of the discriminated union has
 * no `presence` field at all (presence modifiers don't exist for arity-"many"
 * codecs), and presence is a single-choice field, so `.default()` after
 * `.optional()` is unrepresentable. What the schema cannot express (duplicate
 * key names, wire strings that don't parse), the builder throws on loudly.
 */

/** Scalar codec kinds legal as `array`/`csv` elements (besides `enum`). */
export const ELEMENT_SCALAR_KINDS = [
  "boolean",
  "index",
  "integer",
  "isoDate",
  "number",
  "string",
  "timestamp",
] as const;

export type ElementDescriptor = z.output<typeof elementSchema>;

export type ElementScalarKind = (typeof ELEMENT_SCALAR_KINDS)[number];

export type ExplorerState = z.output<typeof explorerStateSchema>;

export type KeyDescriptor = z.output<typeof keySchema>;

export type PresenceDescriptor = z.output<typeof presenceSchema>;

/** A copy of the encode inputs without one key — absence, immutably. */
export function omitInput(
  inputs: ExplorerState["inputs"],
  name: string,
): ExplorerState["inputs"] {
  return Object.fromEntries(
    Object.entries(inputs).filter(([key]) => key !== name),
  );
}

/** `p.enum` members: at least one, none empty. */
const enumMembersSchema = z.array(z.string().min(1)).min(1);

/**
 * Element codec of an `array`/`csv` key. `json` is deliberately not offered
 * as an element: its serialization routinely contains commas (a CV4 trap) and
 * a nested composite has no place in a one-line picker.
 */
const elementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(ELEMENT_SCALAR_KINDS) }),
  z.object({ kind: z.literal("enum"), members: enumMembersSchema }),
]);

/**
 * Presence for arity-"single" keys: exactly one of required / optional /
 * defaulted — the default's value is the codec's wire form.
 */
const presenceSchema = z.union([
  z.literal("optional"),
  z.literal("required"),
  z.object({ default: z.string() }),
]);

/**
 * One composed search-param key. Discriminated on `kind`; the `array` arm
 * omits `presence` (structurally illegal) and stores its `.catch()` fallback
 * as element wire forms — an array's wire form IS a list of per-key values.
 */
const keySchema = z.discriminatedUnion("kind", [
  z.object({
    catch: z.string().optional(),
    kind: z.enum([...ELEMENT_SCALAR_KINDS, "json"]),
    name: z.string(),
    presence: presenceSchema,
  }),
  z.object({
    catch: z.string().optional(),
    kind: z.literal("enum"),
    members: enumMembersSchema,
    name: z.string(),
    presence: presenceSchema,
  }),
  z.object({
    catch: z.string().optional(),
    element: elementSchema,
    kind: z.literal("csv"),
    name: z.string(),
    presence: presenceSchema,
  }),
  z.object({
    catch: z.array(z.string()).optional(),
    element: elementSchema,
    kind: z.literal("array"),
    name: z.string(),
  }),
]);

export const explorerStateSchema = z.object({
  /**
   * Encode-pane inputs, keyed by param name: a wire-form string per
   * arity-"single" key (csv included — its wire form is the joined list), a
   * list of element wire forms per `array` key. An absent key means the
   * param is absent — the empty string stays a real value (S3).
   */
  inputs: z.record(z.string(), z.union([z.array(z.string()), z.string()])),
  keys: z.array(keySchema),
  /** Decode-pane input: a raw query string (leading `?` optional). */
  query: z.string(),
});

/**
 * The starter example supplied by the route's `.default()` — one key per
 * headline behavior: optional presence, value default + catch recovery, enum,
 * and a repeated-key array. The starter decode query exercises `.catch()`
 * (page=abc), `%20` decoding, and P8 unknown-key hygiene (utm_source).
 */
export const STARTER_STATE: ExplorerState = {
  inputs: { page: "2", q: "wire format", tags: ["sale", "new"] },
  keys: [
    { kind: "string", name: "q", presence: "optional" },
    { catch: "1", kind: "integer", name: "page", presence: { default: "1" } },
    {
      kind: "enum",
      members: ["name", "newest", "price"],
      name: "sort",
      presence: { default: "name" },
    },
    { element: { kind: "string" }, kind: "array", name: "tags" },
  ],
  query: "page=abc&q=a%20b&tags=x&tags=y&utm_source=demo",
};
