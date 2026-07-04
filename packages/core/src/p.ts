import type { StandardSchemaV1 } from "@standard-schema/spec";

import { type Codec, createCodec } from "./codec.js";
import { ParamourError, ParseError, SerializeError } from "./errors.js";

// Wire grammars per wire-format spec §4. `Number()` alone is too loose
// (accepts hex, trims whitespace), hence explicit anchored patterns.
const INTEGER_RE = /^-?\d+$/;
const NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Canonical emit is Date#toISOString (milliseconds always); parse tolerates
// missing milliseconds. UTC (`Z`) only — offsets are rejected in v0.1.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function expectValidDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new SerializeError("Expected a valid Date");
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
    throw new SerializeError(`Expected a finite number, got ${String(value)}`);
  }
  return String(value);
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
      serializeElement: (value) => (value === true ? "true" : "false"),
    });
  },

  custom<Out>(codec: {
    parse: (raw: string) => Out;
    serialize: (value: Out) => string;
  }): Codec<Out> {
    return createCodec<Out>({
      parseElement: codec.parse,
      serializeElement: (value) => codec.serialize(value as Out),
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
            `${String(value)} is not one of: ${members.join(", ")}`,
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
        const serialized = serializeFiniteNumber(value);
        if (!Number.isSafeInteger(value)) {
          throw new SerializeError(`${serialized} is not a safe integer`);
        }
        return serialized;
      },
    });
  },

  isoDate(): Codec<Date> {
    return createCodec<Date>({
      parseElement: (raw) => {
        const match = ISO_DATE_RE.exec(raw);
        if (!match) {
          throw new ParseError(`"${raw}" is not a YYYY-MM-DD date`);
        }
        const [, year, month, day] = match as unknown as [
          string,
          string,
          string,
          string,
        ];
        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );
        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          throw new ParseError(`"${raw}" is not a real calendar date`);
        }
        return date;
      },
      serializeElement: (value) =>
        expectValidDate(value).toISOString().slice(0, 10),
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
        const result = runSchemaSync(schema, value);
        if (result.issues !== undefined) {
          throw new SerializeError(
            `Schema validation failed: ${result.issues}`,
          );
        }
        // lib.d.ts types JSON.stringify as always-string, but it returns
        // undefined for undefined/function/symbol inputs.
        const serialized = JSON.stringify(value) as string | undefined;
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
      serializeElement: serializeFiniteNumber,
    });
  },

  string<S extends StandardSchemaV1<string, string>>(
    schema?: S,
  ): Codec<S extends undefined ? string : StandardSchemaV1.InferOutput<S>> {
    return createCodec({
      parseElement: (raw) => (schema ? refine(schema, raw) : raw),
      serializeElement: (value) => {
        if (typeof value !== "string") {
          throw new SerializeError("Expected a string");
        }
        return value;
      },
    });
  },

  stringArray(): Codec<string[]> {
    return createCodec<string[]>({
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
        return date;
      },
      serializeElement: (value) => expectValidDate(value).toISOString(),
    });
  },
};
