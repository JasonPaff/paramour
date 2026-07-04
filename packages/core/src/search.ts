import type { AnyCodec, OutputOf, PresenceOf } from "./codec.js";

import {
  foreignMessage,
  ParamourError,
  ParseError,
  rebrandForeign,
  SearchDecodeError,
  type SearchIssue,
  SerializeError,
} from "./errors.js";

/**
 * href-input side (design-02 D4): required presence stays required;
 * optional and defaulted keys may be omitted. Array (arity-"many") keys may
 * also be omitted: absent and [] are the same wire state (S6/P6), so
 * requiring `tags: []` ceremony would be pure noise.
 */
export type InferSearchInput<S extends SearchConfig> = {
  [K in Exclude<keyof S, OptionalInputKeys<S>>]: OutputOf<S[K]>;
} & {
  [K in OptionalInputKeys<S>]?: OutputOf<S[K]>;
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

/** A search-params schema: key → codec. */
export type SearchConfig = Record<string, AnyCodec>;

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
 */
export function decodeSearch<S extends SearchConfig>(
  config: S,
  source: SearchSource,
): InferSearchOutput<S> {
  const issues: SearchIssue[] = [];
  // Built as entries so keys like "__proto__" become ordinary own properties
  // of the result (Object.fromEntries uses define, not set, semantics).
  const entries: [string, unknown][] = [];
  // Snapshot every declared key's wire values before any user code (custom
  // parse, default/catch factories) runs: code holding the source reference
  // can't change what later declared keys read mid-decode.
  const sourceValues = readDeclaredValues(config, source);

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

  for (const [key, codec] of Object.entries(config)) {
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
  return Object.fromEntries(entries) as InferSearchOutput<S>;
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
 */
export function encodeSearch<S extends SearchConfig>(
  config: S,
  input: InferSearchInput<S>,
): [string, string][] {
  // The TS contract forbids non-object inputs, but plain-JS callers reach
  // here; a null input must fail loud, not read as every-key-absent.
  const untrusted: unknown = input;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new SerializeError(
      `search input must be an object, got ${untrusted === null ? "null" : typeof untrusted}`,
    );
  }
  const pairs: [string, string][] = [];
  const values = untrusted as Record<string, unknown>;

  for (const [key, codec] of Object.entries(config)) {
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

/** Convenience: encode + build in one step. */
export function searchToString<S extends SearchConfig>(
  config: S,
  input: InferSearchInput<S>,
): string {
  return buildSearchString(encodeSearch(config, input));
}

/**
 * encodeURIComponent throws a raw URIError on lone surrogates; wrap it so
 * the documented "every error is a ParamourError" contract holds (S7).
 */
function encodeComponent(text: string): string {
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
 * Snapshots the wire values of every declared key from a source, before any
 * user code runs. Declared keys only, on purpose: unknown keys are never
 * validated, so malformed junk under keys paramour doesn't own (qs bracket
 * params, numbers) can't fail a decode (P8). Malformed values under a
 * DECLARED key are a loud {@link ParamourError} — the source doesn't match
 * its stated contract — never a silent key drop.
 */
function readDeclaredValues(
  config: SearchConfig,
  source: SearchSource,
): Map<string, string[]> {
  // The TS contract forbids non-object sources, but plain-JS callers reach
  // here; fail branded, not with a raw TypeError out of Object.hasOwn.
  const untrusted: unknown = source;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new ParamourError(
      `search source must be an object, got ${untrusted === null ? "null" : typeof untrusted}`,
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
        throw new ParamourError(
          `search source values for "${key}" must be strings, got ${typeof value}`,
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
 * Reads one input property for {@link encodeSearch}. Not a bare `values[key]`
 * read: keys like "constructor" must not pick up inherited Object.prototype
 * members as present values. Not plain `Object.hasOwn` either: class
 * instances expose their values through prototype getters. So: own
 * properties always count; prototype levels count only accessors (a data
 * property there is a class method or `constructor`, not a value); and the
 * walk stops before the terminal prototype by chain position, not identity,
 * so cross-realm inputs (vm, jsdom, iframes) exclude THEIR Object.prototype
 * members too.
 */
function readInputValue(values: Record<string, unknown>, key: string): unknown {
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
        throw new ParamourError(
          `search source values for "${key}" must be strings, got ${typeof element}`,
        );
      }
    }
    return copy as string[];
  }
  throw new ParamourError(
    `search source value for "${key}" must be a string or string[], got ${typeof value}`,
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
        `reading search input "${key}" threw: ${foreignMessage(error)}`,
        { cause: error },
      ),
  );
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
