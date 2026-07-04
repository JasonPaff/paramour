import type { StandardSchemaV1 } from "@standard-schema/spec";

import { type Codec, createCodec } from "./codec.js";
import { ParamourError, ParseError, SerializeError } from "./errors.js";

// Wire grammars per wire-format spec §4. `Number()` alone is too loose
// (accepts hex, trims whitespace), hence explicit anchored patterns.
const INTEGER_RE = /^-?\d+$/;
const NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Canonical emit is Date#toISOString (milliseconds always); parse tolerates
// missing milliseconds. UTC (`Z`) only — offsets are rejected in v0.1.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * Serialize-side Date guard. Years outside 0000–9999 are rejected:
 * toISOString switches to the expanded ±6-digit-year form there, which the
 * wire grammars (§4) cannot represent — better a loud SerializeError than a
 * URL that can never round-trip.
 */
function expectSerializableDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new SerializeError("Expected a valid Date");
  }
  const year = value.getUTCFullYear();
  if (year < 0 || year > 9999) {
    throw new SerializeError(
      `Date year ${String(year)} is outside the representable 0000-9999 range`,
    );
  }
  return value;
}

function parseIntegerElement(raw: string): number {
  if (!INTEGER_RE.test(raw)) {
    throw new ParseError(`"${raw}" is not an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new ParseError(`"${raw}" is outside the safe integer range`);
  }
  return value;
}

function parseNumberElement(raw: string): number {
  if (!NUMBER_RE.test(raw)) {
    throw new ParseError(`"${raw}" is not a number`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ParseError(`"${raw}" is not a finite number`);
  }
  return value;
}

function refine<Out>(
  schema: StandardSchemaV1<unknown, Out>,
  value: unknown,
): Out {
  const result = runSchemaSync(schema, value);
  if (result.issues !== undefined) {
    throw new ParseError(`Schema validation failed: ${result.issues}`);
  }
  return result.value;
}

/**
 * Serialize-side twin of {@link refine}: schema-invalid in-memory values must
 * fail loudly at link-build time, not on the next navigation. The schema's
 * returned value is what goes on the wire, so normalizing schemas emit
 * canonical form. Transforming (In≠Out) schemas are parse-only by design —
 * their output fails input validation here; use `p.custom` for bidirectional
 * transforms.
 */
function refineForSerialize(schema: StandardSchemaV1, value: unknown): unknown {
  const result = runSchemaSync(schema, value);
  if (result.issues !== undefined) {
    throw new SerializeError(`Schema validation failed: ${result.issues}`);
  }
  return result.value;
}

/**
 * Runs a Standard Schema synchronously. Standard Schema permits async
 * validation, but URL parsing must be sync — async schemas are a documented
 * runtime error (design-02 D7).
 */
function runSchemaSync<Out>(
  schema: StandardSchemaV1<unknown, Out>,
  value: unknown,
): { issues: string } | { issues?: undefined; value: Out } {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new ParamourError(
      "Async Standard Schema validation is not supported: URL parsing must be synchronous",
    );
  }
  if (result.issues) {
    return { issues: result.issues.map((issue) => issue.message).join("; ") };
  }
  return { issues: undefined, value: result.value };
}

function serializeFiniteNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SerializeError(`Expected a finite number, got ${show(value)}`);
  }
  return String(value);
}

/**
 * String() for error messages: objects without a usable primitive conversion
 * (null-prototype objects, Symbol.toPrimitive throwers) make String() itself
 * throw a raw TypeError, which would escape before the guard's SerializeError
 * is even constructed.
 */
function show(value: unknown): string {
  try {
    return String(value);
  } catch {
    return `[unstringifiable ${typeof value}]`;
  }
}

/**
 * JSON.stringify throws raw TypeErrors (circular refs, BigInt) and lets
 * toJSON() exceptions escape; wrap them so the ParamourError contract holds.
 */
function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new SerializeError("Value is not JSON-serializable", {
      cause: error,
    });
  }
}

/**
 * The `p.*` wire-codec builders (DESIGN §5 layer 1, design-02 D9).
 * Each codec defines how one value crosses the URL boundary, both directions.
 */
export const p = {
  boolean(): Codec<boolean> {
    return createCodec<boolean>({
      parseElement: (raw) => {
        if (raw === "true") return true;
        if (raw === "false") return false;
        throw new ParseError(`"${raw}" is not "true" or "false"`);
      },
      serializeElement: (value) => {
        if (typeof value !== "boolean") {
          throw new SerializeError(`Expected a boolean, got ${show(value)}`);
        }
        return value ? "true" : "false";
      },
    });
  },

  custom<Out>(codec: {
    parse: (raw: string) => Out;
    serialize: (value: Out) => string;
  }): Codec<Out> {
    return createCodec<Out>({
      parseElement: (raw) => {
        try {
          return codec.parse(raw);
        } catch (error) {
          // Paramour's own errors are not foreign: config-level failures
          // (async schema, builder misuse) must stay loud, never be
          // downgraded to a .catch()-recoverable ParseError.
          if (error instanceof ParamourError) throw error;
          // Normalize foreign throws so .catch() recovery and per-key issue
          // aggregation see them (they match on ParseError).
          throw new ParseError(
            error instanceof Error ? error.message : String(error),
            { cause: error },
          );
        }
      },
      serializeElement: (value) => {
        try {
          return codec.serialize(value as Out);
        } catch (error) {
          if (error instanceof ParamourError) throw error;
          throw new SerializeError(
            error instanceof Error ? error.message : show(error),
            { cause: error },
          );
        }
      },
    });
  },

  enum<const M extends readonly [string, ...string[]]>(
    members: M,
  ): Codec<M[number]> {
    const set = new Set<string>(members);
    return createCodec<M[number]>({
      parseElement: (raw) => {
        if (!set.has(raw)) {
          throw new ParseError(`"${raw}" is not one of: ${members.join(", ")}`);
        }
        return raw;
      },
      serializeElement: (value) => {
        if (typeof value !== "string" || !set.has(value)) {
          throw new SerializeError(
            `${show(value)} is not one of: ${members.join(", ")}`,
          );
        }
        return value;
      },
    });
  },

  integer<S extends StandardSchemaV1<number, number>>(
    schema?: S,
  ): Codec<S extends undefined ? number : StandardSchemaV1.InferOutput<S>> {
    return createCodec({
      parseElement: (raw) => {
        const value = parseIntegerElement(raw);
        return schema ? refine(schema, value) : value;
      },
      serializeElement: (value) => {
        const refined = schema ? refineForSerialize(schema, value) : value;
        const serialized = serializeFiniteNumber(refined);
        if (!Number.isSafeInteger(refined)) {
          throw new SerializeError(`${serialized} is not a safe integer`);
        }
        return serialized;
      },
    });
  },

  isoDate(): Codec<Date> {
    return createCodec<Date>({
      parseElement: (raw) => {
        if (!ISO_DATE_RE.test(raw)) {
          throw new ParseError(`"${raw}" is not a YYYY-MM-DD date`);
        }
        // ISO-string construction, not Date.UTC: the latter maps years 0-99
        // to 1900+year. The round-trip comparison rejects days the engine
        // would silently normalize (2026-02-30 → Mar 2).
        const date = new Date(`${raw}T00:00:00.000Z`);
        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== raw
        ) {
          throw new ParseError(`"${raw}" is not a real calendar date`);
        }
        return date;
      },
      serializeElement: (value) =>
        expectSerializableDate(value).toISOString().slice(0, 10),
    });
  },

  json<S extends StandardSchemaV1>(
    schema: S,
  ): Codec<StandardSchemaV1.InferOutput<S>> {
    return createCodec<StandardSchemaV1.InferOutput<S>>({
      parseElement: (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new ParseError(`"${raw}" is not valid JSON`);
        }
        return refine(schema, parsed);
      },
      serializeElement: (value) => {
        const refined = refineForSerialize(schema, value);
        // lib.d.ts types JSON.stringify as always-string, but it returns
        // undefined for undefined/function/symbol inputs.
        const serialized = stringifyJson(refined) as string | undefined;
        if (serialized === undefined) {
          throw new SerializeError("Value is not JSON-serializable");
        }
        return serialized;
      },
    });
  },

  number<S extends StandardSchemaV1<number, number>>(
    schema?: S,
  ): Codec<S extends undefined ? number : StandardSchemaV1.InferOutput<S>> {
    return createCodec({
      parseElement: (raw) => {
        const value = parseNumberElement(raw);
        return schema ? refine(schema, value) : value;
      },
      serializeElement: (value) =>
        serializeFiniteNumber(
          schema ? refineForSerialize(schema, value) : value,
        ),
    });
  },

  string<S extends StandardSchemaV1<string, string>>(
    schema?: S,
  ): Codec<S extends undefined ? string : StandardSchemaV1.InferOutput<S>> {
    return createCodec({
      parseElement: (raw) => (schema ? refine(schema, raw) : raw),
      serializeElement: (value) => {
        const refined = schema ? refineForSerialize(schema, value) : value;
        if (typeof refined !== "string") {
          throw new SerializeError("Expected a string");
        }
        return refined;
      },
    });
  },

  stringArray(): Codec<string[], "required", false, "many"> {
    return createCodec<string[], "many">({
      arity: "many",
      parseElement: (raw) => raw,
      serializeElement: (value) => {
        if (typeof value !== "string") {
          throw new SerializeError("Expected an array of strings");
        }
        return value;
      },
    });
  },

  timestamp(): Codec<Date> {
    return createCodec<Date>({
      parseElement: (raw) => {
        if (!TIMESTAMP_RE.test(raw)) {
          throw new ParseError(`"${raw}" is not an ISO 8601 UTC timestamp`);
        }
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
          throw new ParseError(`"${raw}" is not a real instant`);
        }
        // The engine silently normalizes impossible fields (Feb 30 → Mar 1,
        // 24:00 → next day). Pad the input to canonical millisecond form and
        // require an exact round-trip instead.
        const canonical = raw.replace(
          /(?:\.(\d{1,3}))?Z$/,
          (_match, ms: string | undefined) => `.${(ms ?? "").padEnd(3, "0")}Z`,
        );
        if (date.toISOString() !== canonical) {
          throw new ParseError(`"${raw}" is not a real instant`);
        }
        return date;
      },
      serializeElement: (value) => expectSerializableDate(value).toISOString(),
    });
  },
};
