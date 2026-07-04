import type { AnyCodec, OutputOf, PresenceOf } from "./codec.js";

import {
  ParamourError,
  ParseError,
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
    const values = readSourceValues(source, key);

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
          // The no-default arm is unreachable via the public builders
          // (.default() always sets a thunk) but keeps the D4 invariant —
          // every declared key present — for structurally-built codecs.
          if (codec["~defaultValue"] !== undefined) {
            entries.push([key, codec["~defaultValue"]()]);
          } else {
            entries.push([key, undefined]);
          }
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
 * serialized wire form. Only value-form defaults elide — factory defaults
 * are excluded, since a time-varying factory would elide an explicit value
 * that later decodes as a different one.
 */
export function encodeSearch<S extends SearchConfig>(
  config: S,
  input: InferSearchInput<S>,
): [string, string][] {
  const pairs: [string, string][] = [];
  const values = input as Record<string, unknown>;

  for (const [key, codec] of Object.entries(config)) {
    const value = readInputValue(values, key);

    if (value === undefined) {
      if (codec["~arity"] === "many") {
        continue; // absent array param ≡ [] → nothing on the wire (S6)
      }
      if (codec["~presence"] === "required") {
        throw new SerializeError(`required search param "${key}" is missing`);
      }
      continue; // absent optional/defaulted param → key omitted (S3)
    }

    if (codec["~arity"] === "many") {
      if (!Array.isArray(value)) {
        throw new SerializeError(
          `search param "${key}" expects an array, got ${typeof value}`,
        );
      }
      // Array codecs cannot carry defaults, so no elision applies.
      for (const element of value) {
        pairs.push([key, codec["~serializeElement"](element)]);
      }
      continue;
    }

    const serialized = codec["~serializeElement"](value);

    if (serialized === codec["~defaultSerialized"]) continue; // D8 elision

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
  try {
    return encodeURIComponent(text);
  } catch (error) {
    throw new SerializeError(
      `text is not encodable as a URL component: ${String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Reads one input property for {@link encodeSearch}. Not a bare `values[key]`
 * read: keys like "constructor" must not pick up inherited Object.prototype
 * members as present values. Not plain `Object.hasOwn` either: class
 * instances expose their values through prototype getters. So: walk the
 * chain, accept anything found below Object.prototype, read through the
 * original receiver so getters see the instance.
 */
function readInputValue(values: Record<string, unknown>, key: string): unknown {
  let current: null | object = values;
  while (current !== null && current !== Object.prototype) {
    if (Object.hasOwn(current, key)) return values[key];
    current = Object.getPrototypeOf(current) as null | object;
  }
  return undefined;
}

/**
 * Reads one declared key's wire values from a source. Per-key on purpose:
 * unknown keys are never touched, so malformed junk under keys paramour
 * doesn't own (qs bracket params, numbers) can't fail a decode (P8).
 * Malformed values under a DECLARED key are a loud {@link ParamourError} —
 * the source doesn't match its stated contract.
 */
function readSourceValues(source: SearchSource, key: string): string[] {
  if (source instanceof URLSearchParams) {
    return source.getAll(key);
  }
  if (!Object.hasOwn(source, key)) return [];
  const value = source[key];
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    for (const element of value as unknown[]) {
      if (typeof element !== "string") {
        throw new ParamourError(
          `search source values for "${key}" must be strings, got ${typeof element}`,
        );
      }
    }
    return [...value];
  }
  throw new ParamourError(
    `search source value for "${key}" must be a string or string[], got ${typeof value}`,
  );
}
