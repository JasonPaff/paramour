import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { AnyCodec, OutputOf, PresenceOf } from "./codec.js";

import {
  describeType,
  foreignMessage,
  type Issue,
  ParamourError,
  ParseError,
  rebrandForeign,
  SearchDecodeError,
  SearchSourceError,
  SerializeError,
} from "./errors.js";
import { runStandardSchemaSync } from "./schema.js";

/**
 * href-input side (design-02 D4): required presence stays required;
 * optional and defaulted keys may be omitted. Array (arity-"many") keys may
 * also be omitted: absent and [] are the same wire state (S6/P6), so
 * requiring `tags: []` ceremony would be pure noise. Omittable keys also
 * admit an EXPLICIT `undefined` — encodeSearch already treats that value as
 * absent (S3), and without the `| undefined` widening a decoded
 * {@link InferSearchOutput} (every key present, optional presence as
 * `| undefined`) could not flow back into href under
 * `exactOptionalPropertyTypes` without key-by-key reassembly.
 */
export type InferSearchInput<S extends SearchConfig> = {
  [K in Exclude<keyof S, OptionalInputKeys<S>>]: OutputOf<S[K]>;
} & {
  [K in OptionalInputKeys<S>]?: OutputOf<S[K]> | undefined;
};

/**
 * Parse-output side (design-02 D4): every declared key is PRESENT on the
 * object; optional presence contributes `| undefined` to the value type.
 */
export type InferSearchOutput<S extends SearchConfig> = {
  [K in keyof S]: PresenceOf<S[K]> extends "optional"
    ? OutputOf<S[K]> | undefined
    : OutputOf<S[K]>;
};

/**
 * The whole-object search escape hatch (design-04 SS1/SS2): wraps a bare
 * Standard Schema in a branded marker so `search:` config discrimination is
 * unambiguous at both the type and runtime level. `~`-prefixed members are
 * reserved (codec convention) — a codec map never carries them at the top
 * level, so there is no collision with user param names.
 */
export interface RawSearch<S extends StandardSchemaV1> {
  readonly "~kind": "raw-search";
  readonly "~schema": S;
}

/** A search-params schema: key → codec. */
export type SearchConfig = Record<string, AnyCodec>;

/**
 * href / encode side of a `search:` config (design-04 SS6): a `RawSearch`
 * route accepts the raw wire record (SS5 — the schema never runs on encode,
 * so there's no encode-side type to infer from it); a codec map keeps its
 * existing `InferSearchInput` behavior. Module-exported for route.ts/href.ts,
 * not barrel-exported — same precedent as `encodeComponent`/`readInputValue`.
 */
export type SearchInputOf<SC> =
  SC extends RawSearch<StandardSchemaV1>
    ? Record<string, string | string[]>
    : SC extends SearchConfig
      ? InferSearchInput<SC>
      : never;

/**
 * Parse-output side of a `search:` config (design-04 SS6): a `RawSearch`
 * route's output is the schema's own inferred output; a codec map keeps its
 * existing `InferSearchOutput` behavior. Module-exported for
 * route.ts/href.ts, not barrel-exported.
 */
export type SearchOutputOf<SC> =
  SC extends RawSearch<infer S>
    ? StandardSchemaV1.InferOutput<S>
    : SC extends SearchConfig
      ? InferSearchOutput<SC>
      : never;

/**
 * The `search:` config slot's full type (design-04 SS2): a codec map (the
 * main road) or a `RawSearch` marker (the escape hatch). Internal — not
 * barrel-exported; `Route`/`RouteConfig`/`HrefArgs` consume it as their `SC`
 * bound.
 */
export type SearchSlot = RawSearch<StandardSchemaV1> | SearchConfig;

/**
 * Decoded value-layer sources (wire spec §1): Next's server `searchParams`
 * shape or the client's `URLSearchParams`. Both are already percent-decoded
 * by the platform.
 */
export type SearchSource =
  Record<string, string | string[] | undefined> | URLSearchParams;

type OptionalInputKeys<S extends SearchConfig> = {
  [K in keyof S]: S[K]["~arity"] extends "many"
    ? K
    : PresenceOf<S[K]> extends "required"
      ? never
      : K;
}[keyof S];

/**
 * Builds the byte-layer query string from decoded pairs. Hand-rolled on
 * purpose: URLSearchParams#toString would emit `+` for space; we emit `%20`
 * (S2). Returns "" for an empty pair set (S1). Unencodable text (lone
 * surrogates) throws {@link SerializeError} (S7).
 */
export function buildSearchString(
  pairs: readonly (readonly [string, string])[],
): string {
  if (pairs.length === 0) return "";
  return `?${pairs
    .map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`)
    .join("&")}`;
}

/**
 * Decodes search params against a config. Unknown keys are ignored (P8):
 * source values are only read (and validated) for declared keys, so junk
 * under keys paramour doesn't own can never fail a decode.
 * Throws {@link SearchDecodeError} carrying one issue per failed key.
 *
 * A `RawSearch` config (design-04 SS2) branches to the whole-object schema
 * path instead: every source key reaches the schema (P8 does not apply
 * there — the schema owns stripping or passing through extras).
 */
export function decodeSearch<S extends SearchSlot>(
  config: S,
  source: SearchSource,
): SearchOutputOf<S> {
  requireSearchConfig(config);
  if (isRawSearch(config)) {
    return decodeRawSearch(config, source) as SearchOutputOf<S>;
  }
  // The conditional SearchSlot doesn't narrow inside the generic body once
  // the RawSearch branch returns (S stays a generic type parameter); this
  // cast unifies the two branches at the one chokepoint (same move as
  // routeData's config cast). tsc requires the cast (isRawSearch's `is
  // RawSearch<...>` guard doesn't narrow a generic-typed parameter's negative
  // branch); no-unnecessary-type-assertion mis-flags it as redundant for this
  // exact generic-parameter-plus-user-guard shape.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const searchConfig = config as SearchConfig;
  const issues: Issue[] = [];
  // Built as entries so keys like "__proto__" become ordinary own properties
  // of the result (Object.fromEntries uses define, not set, semantics).
  const entries: [string, unknown][] = [];
  // Snapshot every declared key's wire values before any user code (custom
  // parse, default/catch factories) runs: code holding the source reference
  // can't change what later declared keys read mid-decode.
  const sourceValues = readDeclaredValues(searchConfig, source);

  // Absence is presence's job — .catch() only ever recovers parse
  // *failures* (D2), which is why this is shared by both arity branches.
  const recoverParseError = (
    error: unknown,
    key: string,
    codec: AnyCodec,
  ): void => {
    if (error instanceof ParseError && codec["~catchValue"] !== undefined) {
      entries.push([key, codec["~catchValue"]()]);
    } else if (error instanceof ParseError) {
      issues.push({ key, message: error.message });
    } else {
      throw error;
    }
  };

  for (const [key, codec] of Object.entries(searchConfig)) {
    const values = sourceValues.get(key) ?? [];

    if (codec["~arity"] === "many") {
      // Array codecs consume all values in wire order; absent → [] (P6).
      // Presence modifiers are banned on array codecs, so no absence
      // handling exists here.
      try {
        entries.push([key, values.map((raw) => codec["~parseElement"](raw))]);
      } catch (error) {
        recoverParseError(error, key, codec);
      }
      continue;
    }

    if (values.length === 0) {
      switch (codec["~presence"]) {
        case "defaulted":
          // The optional-chain covers structurally-built codecs with no
          // default thunk (unreachable via the public builders); the D4
          // every-declared-key-present invariant holds either way.
          entries.push([key, codec["~defaultValue"]?.()]);
          break;
        case "optional":
          entries.push([key, undefined]);
          break;
        case "required":
          issues.push({ key, message: "required search param is missing" });
          break;
      }
      continue;
    }

    const first = values[0];
    if (first === undefined) continue; // unreachable: values.length >= 1 here

    try {
      if (values.length > 1) {
        // Duplicate keys on a scalar codec: never silently disambiguated (P5).
        throw new ParseError(
          `received ${String(values.length)} values for a single-value param`,
        );
      }
      entries.push([key, codec["~parseElement"](first)]);
    } catch (error) {
      recoverParseError(error, key, codec);
    }
  }

  if (issues.length > 0) {
    throw new SearchDecodeError(issues);
  }
  return Object.fromEntries(entries) as SearchOutputOf<S>;
}

/**
 * encodeURIComponent throws a raw URIError on lone surrogates; wrap it so
 * the documented "every error is a ParamourError" contract holds (S7).
 * Exported for path.ts (the byte-layer chokepoint is shared with RL5's
 * segment encoding), not from the package barrel.
 */
export function encodeComponent(text: string): string {
  return rebrandForeign(
    () => encodeURIComponent(text),
    (error) =>
      new SerializeError(
        `text is not encodable as a URL component: ${foreignMessage(error)}`,
        { cause: error },
      ),
  );
}

/**
 * Encodes an input object to ordered wire pairs (decoded value layer).
 * Deterministic: config declaration order, array elements in order (S5).
 * Caveat: JS property enumeration puts integer-like keys ("0", "42") first
 * in ascending numeric order regardless of declaration — declaration order
 * is unrecoverable for those, so they sort numerically before all others.
 * Params equal to their `.default()` are elided (design-02 D8), compared by
 * serialized wire form against the live default (re-serialized per encode —
 * a build-time snapshot would go stale if a reference-typed default were
 * mutated, silently dropping explicit values that then decode differently).
 * Only value-form defaults elide — factory defaults are excluded, since a
 * time-varying factory would elide an explicit value that later decodes as
 * a different one.
 *
 * A `RawSearch` config (design-04 SS5) branches to a raw pass-through
 * instead: no serializer exists for a whole-object schema, so the caller's
 * record goes straight to the byte layer and the schema never runs on encode.
 */
export function encodeSearch<S extends SearchSlot>(
  config: S,
  input: SearchInputOf<S>,
): [string, string][] {
  requireSearchConfig(config);
  if (isRawSearch(config)) {
    return encodeRawSearch(input);
  }
  // See the matching cast + comment in decodeSearch above.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const searchConfig = config as SearchConfig;
  // The TS contract forbids non-object inputs, but plain-JS callers reach
  // here; a null input must fail loud, not read as every-key-absent.
  const untrusted: unknown = input;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new SerializeError(
      `search input must be an object, got ${describeType(untrusted)}`,
    );
  }
  const pairs: [string, string][] = [];
  const values = untrusted as Record<string, unknown>;

  for (const [key, codec] of Object.entries(searchConfig)) {
    const value = readInputValue(values, key);

    // Arity first: array codecs carry runtime ~presence "required", so the
    // scalar required-missing check below must never see them.
    if (codec["~arity"] === "many") {
      if (value === undefined) {
        continue; // absent array param ≡ [] → nothing on the wire (S6)
      }
      if (!Array.isArray(value)) {
        throw new SerializeError(
          `search param "${key}" expects an array, got ${typeof value}`,
        );
      }
      // Array codecs cannot carry defaults, so no elision applies.
      for (const element of value) {
        pairs.push([key, serializeValue(codec, key, element)]);
      }
      continue;
    }

    if (value === undefined) {
      if (codec["~presence"] === "required") {
        throw new SerializeError(`required search param "${key}" is missing`);
      }
      continue; // absent optional/defaulted param → key omitted (S3)
    }

    const serialized = serializeValue(codec, key, value);

    // D8 elision, gated on an elidable default existing — an ungated
    // comparison would let a (contract-violating) serialize that returns
    // undefined match undefined and silently drop the param.
    if (
      codec["~defaultElides"] &&
      codec["~defaultValue"] !== undefined &&
      serialized === serializeValue(codec, key, codec["~defaultValue"]())
    ) {
      continue;
    }

    pairs.push([key, serialized]);
  }

  return pairs;
}

/**
 * Runtime discriminant for the `search:` slot (design-04 SS2): the reserved
 * `~kind` marker is unambiguous against a codec map, which never carries a
 * top-level `~`-prefixed key. Module-exported for standard-schema.ts, not
 * barrel-exported.
 */
export function isRawSearch(
  config: SearchSlot,
): config is RawSearch<StandardSchemaV1> {
  return "~kind" in config && config["~kind"] === "raw-search";
}

/**
 * The whole-object search escape hatch (design-04 SS1, maintainer ruling):
 * an explicit, greppable wrapper around a bare Standard Schema so a route's
 * `search:` slot never falls into the degraded raw mode by accident — a
 * bare `search: schema` could be confused for a codec map, but `rawSearch`
 * is a conscious act. Per-key defaults/`.catch()` and round-trip encoding
 * are deliberately unavailable here (SS7); reach for `p.custom` if you need
 * bidirectional per-key transforms instead.
 */
export function rawSearch<S extends StandardSchemaV1>(schema: S): RawSearch<S> {
  return { "~kind": "raw-search", "~schema": schema };
}

/**
 * Reads one input property for {@link encodeSearch} (and path.ts's
 * encodeParams — exported for it, not from the package barrel). Not a bare
 * `values[key]` read: keys like "constructor" must not pick up inherited
 * Object.prototype members as present values. Not plain `Object.hasOwn`
 * either: class instances expose their values through prototype getters. So:
 * own properties always count; prototype levels count only accessors (a data
 * property there is a class method or `constructor`, not a value); and the
 * walk stops before the terminal prototype by chain position, not identity,
 * so cross-realm inputs (vm, jsdom, iframes) exclude THEIR Object.prototype
 * members too.
 */
export function readInputValue(
  values: Record<string, unknown>,
  key: string,
): unknown {
  if (Object.hasOwn(values, key)) return readThroughReceiver(values, key);
  let current = Object.getPrototypeOf(values) as null | object;
  while (current !== null && Object.getPrototypeOf(current) !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) {
      // Nearest declaration wins: a data property here shadows anything
      // deeper and is not a value.
      return descriptor.get === undefined
        ? undefined
        : readThroughReceiver(values, key);
    }
    current = Object.getPrototypeOf(current) as null | object;
  }
  return undefined;
}

/**
 * The TS contract makes a non-object config unrepresentable, but a
 * hand-built route missing `~search` reaches both codecs' entry points via
 * href/parseSearch in plain JS; fail branded — a missing config is a
 * config-contract violation (requireCodec's precedent), never a raw
 * TypeError out of Object.entries/Object.keys. Module-exported for
 * standard-schema.ts, not barrel-exported.
 */
export function requireSearchConfig(config: SearchSlot): void {
  const untrusted: unknown = config;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new ParamourError(
      `search config must be an object, got ${describeType(untrusted)}`,
    );
  }
}

/** Convenience: encode + build in one step. */
export function searchToString<S extends SearchSlot>(
  config: S,
  input: SearchInputOf<S>,
): string {
  return buildSearchString(encodeSearch(config, input));
}

/**
 * The `RawSearch` decode path (design-04 SS3/SS4). The schema receives EVERY
 * source key, normalized to Next's own `searchParams` shape — P8's
 * declared-keys-only stance doesn't apply to a whole-object schema, which
 * owns stripping or passing through extras itself. Sync only, per D7 (the
 * shared runner throws on an async `validate`). A validator that THROWS
 * (rather than returning issues) is rebranded at this chokepoint — the
 * shared runner deliberately stays throw-preserving (plan-04 step 1) so this
 * call site owns the wrap, mirroring how a foreign throw is branded
 * elsewhere in the package.
 */
function decodeRawSearch(
  config: RawSearch<StandardSchemaV1>,
  source: SearchSource,
): unknown {
  const record = readAllValues(source);
  const result = rebrandForeign(
    () => runStandardSchemaSync(config["~schema"], record),
    (error) =>
      new ParamourError(
        `raw-search schema validation threw: ${foreignMessage(error)}`,
        { cause: error },
      ),
  );
  if (result.issues) {
    // SS3/SS4: the spec types issue.path as ReadonlyArray<PropertyKey |
    // PathSegment> where PathSegment is { key }. Valibot emits the object
    // form (a bare String(seg) would be "[object Object]"); Zod emits [] for
    // a root-level issue, Valibot omits path entirely (both join to "", so
    // the sentinel keys off the empty join, not just a nullish path).
    //
    // Array.from, not .map: these arrays belong to the validator, and a
    // ReadonlyArray may be an Array subclass. ArkType's `path` is one, with a
    // variadic constructor -- Array.prototype.map builds its result via
    // Symbol.species (`new ReadonlyPath(0)`), which yields the one-element
    // array [0], so an empty root path would map to the key "0". Array.from
    // always produces a plain Array and is immune.
    const issues: Issue[] = Array.from(result.issues, (issue) => {
      const key = Array.from(issue.path ?? [], (seg) =>
        String(typeof seg === "object" ? seg.key : seg),
      ).join(".");
      return { key: key === "" ? "<search>" : key, message: issue.message };
    });
    throw new SearchDecodeError(issues);
  }
  return result.value;
}

/**
 * The `RawSearch` encode path (design-04 SS5): no serializer exists for a
 * whole-object schema, so the caller's already-wire-shaped record is pushed
 * straight to the byte layer — one pair per string value, one repeated pair
 * per array element — and the schema never runs on encode.
 */
function encodeRawSearch(input: unknown): [string, string][] {
  const untrusted: unknown = input;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new SerializeError(
      `search input must be an object, got ${describeType(untrusted)}`,
    );
  }
  const values = untrusted as Record<string, unknown>;
  const pairs: [string, string][] = [];
  for (const key of Object.keys(values)) {
    const value = readThroughReceiver(values, key);
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const element of value) {
        pairs.push([key, requireRawSearchString(key, element)]);
      }
      continue;
    }
    pairs.push([key, requireRawSearchString(key, value)]);
  }
  return pairs;
}

/**
 * Snapshots EVERY source key's wire values, before any user code (the
 * whole-object schema's `validate`) runs — sibling of
 * {@link readDeclaredValues} that reads all keys instead of declared-only
 * ones (SS3: a whole-object schema has no declared keys of its own).
 * Collapses each key's values by occurrence count (plan-04 point 2): one
 * value → `string`, multiple → `string[]`, uniformly for both
 * `URLSearchParams` and Next-record sources, so the schema author writes one
 * mental model regardless of which source it came from.
 */
function readAllValues(
  source: SearchSource,
): Record<string, string | string[]> {
  // The TS contract forbids non-object sources, but plain-JS callers reach
  // here; fail branded, not with a raw TypeError out of Object.keys.
  const untrusted: unknown = source;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new SearchSourceError(
      `search source must be an object, got ${describeType(untrusted)}`,
      null,
    );
  }
  const grouped = new Map<string, string[]>();
  if (source instanceof URLSearchParams) {
    // Values are validated even though the platform type guarantees strings:
    // a lying subclass or polyfill must surface loudly, exactly like the
    // Record branch below.
    for (const [key, value] of source as Iterable<readonly [string, unknown]>) {
      if (typeof value !== "string") {
        throw new SearchSourceError(
          `search source values for "${key}" must be strings, got ${typeof value}`,
          key,
        );
      }
      const list = grouped.get(key);
      if (list === undefined) grouped.set(key, [value]);
      else list.push(value);
    }
  } else {
    for (const key of Object.keys(source)) {
      const values = readRecordValues(source, key);
      if (values.length > 0) grouped.set(key, values);
    }
  }
  // Built as entries so keys like "__proto__" become ordinary own properties
  // of the result (Object.fromEntries uses define, not set, semantics).
  const entries: [string, string | string[]][] = [];
  for (const [key, values] of grouped) {
    // A single value collapses to a scalar, else stays an array. `grouped`
    // only holds non-empty arrays, so `first` is always defined at length 1;
    // the check re-narrows for noUncheckedIndexedAccess (the repo bans the
    // non-null assertion that would otherwise say so), it guards no real case.
    const [first] = values;
    entries.push([
      key,
      values.length === 1 && first !== undefined ? first : values,
    ]);
  }
  return Object.fromEntries(entries);
}

/**
 * Snapshots the wire values of every declared key from a source, before any
 * user code runs. Declared keys only, on purpose: unknown keys are never
 * validated, so malformed junk under keys paramour doesn't own (qs bracket
 * params, numbers) can't fail a decode (P8). Malformed values under a
 * DECLARED key are a loud {@link SearchSourceError} — the source doesn't
 * match its stated contract — never a silent key drop.
 */
function readDeclaredValues(
  config: SearchConfig,
  source: SearchSource,
): Map<string, string[]> {
  // The TS contract forbids non-object sources, but plain-JS callers reach
  // here; fail branded, not with a raw TypeError out of Object.hasOwn.
  const untrusted: unknown = source;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new SearchSourceError(
      `search source must be an object, got ${describeType(untrusted)}`,
      null,
    );
  }
  const values = new Map<string, string[]>();
  if (source instanceof URLSearchParams) {
    // Single pass over the pairs (getAll per key would rescan the whole
    // list for every declared key). Values are validated even though the
    // platform type guarantees strings: a lying subclass or polyfill must
    // surface loudly, exactly like the Record branch below.
    for (const [key, value] of source as Iterable<readonly [string, unknown]>) {
      if (!Object.hasOwn(config, key)) continue;
      if (typeof value !== "string") {
        throw new SearchSourceError(
          `search source values for "${key}" must be strings, got ${typeof value}`,
          key,
        );
      }
      const list = values.get(key);
      if (list === undefined) values.set(key, [value]);
      else list.push(value);
    }
    return values;
  }
  for (const key of Object.keys(config)) {
    values.set(key, readRecordValues(source, key));
  }
  return values;
}

/**
 * Record-source twin of the URLSearchParams branch in
 * {@link readDeclaredValues}.
 */
function readRecordValues(
  source: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  if (!Object.hasOwn(source, key)) return [];
  const value: unknown = source[key];
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    // Copy FIRST, then validate the copy: validating the caller's array and
    // re-reading it afterwards would let impure index getters present
    // strings to validation yet deliver junk into the returned copy.
    const copy: unknown[] = [...(value as unknown[])];
    for (const element of copy) {
      if (typeof element !== "string") {
        throw new SearchSourceError(
          `search source values for "${key}" must be strings, got ${typeof element}`,
          key,
        );
      }
    }
    return copy as string[];
  }
  throw new SearchSourceError(
    `search source value for "${key}" must be a string or string[], got ${typeof value}`,
    key,
  );
}

/**
 * Property reads run user getters (the class-instance shape
 * {@link readInputValue} supports); a throwing getter must not escape as a
 * raw foreign error. Reads through the original receiver so getters see the
 * instance.
 */
function readThroughReceiver(
  values: Record<string, unknown>,
  key: string,
): unknown {
  return rebrandForeign(
    () => values[key],
    (error) =>
      new SerializeError(
        `reading input "${key}" threw: ${foreignMessage(error)}`,
        { cause: error },
      ),
  );
}

/**
 * Enforces {@link encodeRawSearch}'s wire-value contract (SS5): a raw-search
 * input is already wire-shaped strings, unlike a codec's serializer, so a
 * non-string leaf is a caller-contract violation, not something to coerce.
 */
function requireRawSearchString(key: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new SerializeError(
      `search param "${key}" expects a string or string[], got ${typeof value}`,
    );
  }
  return value;
}

/**
 * Invokes a codec's serializer and enforces its string contract: a custom
 * codec written in plain JS can return undefined, which would otherwise
 * reach the byte layer as the literal text "undefined" — or, worse, match
 * an absent default and silently drop the param.
 */
function serializeValue(codec: AnyCodec, key: string, value: unknown): string {
  const serialized: unknown = codec["~serializeElement"](value);
  if (typeof serialized !== "string") {
    throw new SerializeError(
      `serializer for search param "${key}" must return a string, got ${typeof serialized}`,
    );
  }
  return serialized;
}
