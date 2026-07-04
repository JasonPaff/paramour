import type { AnyCodec, OutputOf, PresenceOf } from "./codec.js";

import { resolveCodecValue } from "./codec.js";
import {
  ParamourError,
  ParseError,
  SearchDecodeError,
  type SearchIssue,
  SerializeError,
} from "./errors.js";

/**
 * href-input side (design-02 D4): required presence stays required;
 * optional and defaulted keys may be omitted.
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
  [K in keyof S]: PresenceOf<S[K]> extends "required" ? never : K;
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
 * Decodes search params against a config. Unknown keys are ignored (P8).
 * Throws {@link SearchDecodeError} carrying one issue per failed key.
 */
export function decodeSearch<S extends SearchConfig>(
  config: S,
  source: SearchSource,
): InferSearchOutput<S> {
  const map = toMultimap(source);
  const issues: SearchIssue[] = [];
  // Built as entries so keys like "__proto__" become ordinary own properties
  // of the result (Object.fromEntries uses define, not set, semantics).
  const entries: [string, unknown][] = [];

  for (const [key, codec] of Object.entries(config)) {
    const values = map.get(key) ?? [];

    if (codec["~arity"] === "many") {
      // Array codecs consume all values in wire order; absent → [] (P6).
      // Presence modifiers are banned on array codecs, so no absence
      // handling exists here.
      try {
        entries.push([key, values.map((raw) => codec["~parseElement"](raw))]);
      } catch (error) {
        if (error instanceof ParseError && codec["~catchValue"] !== undefined) {
          entries.push([key, resolveCodecValue(codec["~catchValue"].value)]);
        } else if (error instanceof ParseError) {
          issues.push({ key, message: error.message });
        } else {
          throw error;
        }
      }
      continue;
    }

    if (values.length === 0) {
      // Absence is presence's job — .catch() never recovers it (D2).
      switch (codec["~presence"]) {
        case "defaulted":
          if (codec["~defaultValue"] !== undefined) {
            entries.push([
              key,
              resolveCodecValue(codec["~defaultValue"].value),
            ]);
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
      if (error instanceof ParseError && codec["~catchValue"] !== undefined) {
        entries.push([key, resolveCodecValue(codec["~catchValue"].value)]);
      } else if (error instanceof ParseError) {
        issues.push({ key, message: error.message });
      } else {
        throw error;
      }
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
 * serialized wire form.
 */
export function encodeSearch<S extends SearchConfig>(
  config: S,
  input: InferSearchInput<S>,
): [string, string][] {
  const pairs: [string, string][] = [];
  const values = input as Record<string, unknown>;

  for (const [key, codec] of Object.entries(config)) {
    // hasOwn, not a bare read: keys like "constructor" must not pick up
    // inherited Object.prototype members as present values.
    const value = Object.hasOwn(values, key) ? values[key] : undefined;

    if (value === undefined) {
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

    if (codec["~defaultValue"] !== undefined) {
      const defaultSerialized = codec["~serializeElement"](
        resolveCodecValue(codec["~defaultValue"].value),
      );
      if (serialized === defaultSerialized) continue; // D8 elision
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
  try {
    return encodeURIComponent(text);
  } catch (error) {
    throw new SerializeError(
      `text is not encodable as a URL component: ${String(error)}`,
      { cause: error },
    );
  }
}

function toMultimap(source: SearchSource): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (source instanceof URLSearchParams) {
    for (const [key, value] of source) {
      const existing = map.get(key);
      if (existing) {
        existing.push(value);
      } else {
        map.set(key, [value]);
      }
    }
    return map;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      map.set(key, [value]);
    } else if (Array.isArray(value)) {
      map.set(key, [...value]);
    } else {
      throw new ParamourError(
        `search source value for "${key}" must be a string or string[], got ${typeof value}`,
      );
    }
  }
  return map;
}
