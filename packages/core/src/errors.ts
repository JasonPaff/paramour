/** One failed key in an aggregate decode error (shared by both surfaces, RL6). */
export interface Issue {
  readonly key: string;
  readonly message: string;
}

/** The single error type surfaced by a full route parse failure (RL6). */
export type RouteDecodeError = ParamsDecodeError | SearchDecodeError;

/**
 * Cross-copy identity brands (RL6). `Symbol.for()` keys resolve in the
 * realm-global symbol registry, so a second physical copy of this module
 * (dual-package hazard, bundler duplication) mints the SAME symbols:
 * `instanceof` recognizes instances across copies, while a structurally
 * identical foreign class lacks the brands entirely. Brands sit on the
 * prototype (non-enumerable), so an instance carries every brand in its
 * chain and subclass/base checks stay hierarchy-correct across copies.
 */
const paramourErrorBrand = Symbol.for("paramour.errors.ParamourError");
const paramsDecodeErrorBrand = Symbol.for("paramour.errors.ParamsDecodeError");
const parseErrorBrand = Symbol.for("paramour.errors.ParseError");
const searchDecodeErrorBrand = Symbol.for("paramour.errors.SearchDecodeError");
const searchSourceErrorBrand = Symbol.for("paramour.errors.SearchSourceError");
const serializeErrorBrand = Symbol.for("paramour.errors.SerializeError");

/** Base class for every error paramour throws. */
export class ParamourError extends Error {
  static {
    brandPrototype(this, paramourErrorBrand);
  }

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }

  // Each class checks its OWN brand: an inherited base check would make
  // every ParamourError pass `instanceof ParseError`. The type-predicate
  // signature is load-bearing — TS narrows `instanceof` from it.
  static override [Symbol.hasInstance](value: unknown): value is ParamourError {
    return hasBrand(value, paramourErrorBrand);
  }
}

/** Aggregate failure for a whole route-params decode (RL6). */
export class ParamsDecodeError extends ParamourError {
  static {
    brandPrototype(this, paramsDecodeErrorBrand);
  }

  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(`Failed to decode route params: ${formatIssues(issues)}`);
    this.issues = issues;
  }

  static override [Symbol.hasInstance](
    value: unknown,
  ): value is ParamsDecodeError {
    return hasBrand(value, paramsDecodeErrorBrand);
  }
}

/**
 * A single wire value failed its codec grammar or schema validation.
 * Thrown by element-level parsing; recoverable via `.catch()`.
 */
export class ParseError extends ParamourError {
  static {
    brandPrototype(this, parseErrorBrand);
  }

  static override [Symbol.hasInstance](value: unknown): value is ParseError {
    return hasBrand(value, parseErrorBrand);
  }
}

/** Aggregate failure for a whole search-params decode. */
export class SearchDecodeError extends ParamourError {
  static {
    brandPrototype(this, searchDecodeErrorBrand);
  }

  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(`Failed to decode search params: ${formatIssues(issues)}`);
    this.issues = issues;
  }

  static override [Symbol.hasInstance](
    value: unknown,
  ): value is SearchDecodeError {
    return hasBrand(value, searchDecodeErrorBrand);
  }
}

/**
 * A search source violated its wire-shape contract (design-08 STD7): a
 * non-object source, or a non-string / non-string[] value under a read key.
 * Thrown by search.ts's source readers; distinct from {@link ParamourError}
 * so the Standard Schema adapter can soften exactly these throws to issues
 * while config-contract violations and rebranded validator throws stay loud.
 */
export class SearchSourceError extends ParamourError {
  static {
    brandPrototype(this, searchSourceErrorBrand);
  }

  /** The offending source key, or null when the source itself is malformed. */
  readonly key: null | string;

  constructor(message: string, key: null | string) {
    super(message);
    this.key = key;
  }

  static override [Symbol.hasInstance](
    value: unknown,
  ): value is SearchSourceError {
    return hasBrand(value, searchSourceErrorBrand);
  }
}

/** A value could not be serialized to the wire (bad type, non-finite, etc.). */
export class SerializeError extends ParamourError {
  static {
    brandPrototype(this, serializeErrorBrand);
  }

  static override [Symbol.hasInstance](
    value: unknown,
  ): value is SerializeError {
    return hasBrand(value, serializeErrorBrand);
  }
}

/**
 * Renders a value's type for "…, got X" error messages, distinguishing null
 * from typeof's "object". Not exported from the package.
 */
export function describeType(value: unknown): string {
  return value === null ? "null" : typeof value;
}

/**
 * Best-effort human-readable message for a foreign (non-paramour) throw.
 * Not exported from the package — internal to error branding.
 */
export function foreignMessage(error: unknown): string {
  return error instanceof Error ? error.message : showValue(error);
}

/**
 * Runs user (or platform) code, letting paramour's own errors pass through
 * and branding any foreign throw via `wrap` — the shared chokepoint for the
 * "every throw is a ParamourError" contract. Not exported from the package.
 */
export function rebrandForeign<T>(
  run: () => T,
  wrap: (error: unknown) => ParamourError,
): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ParamourError) throw error;
    throw wrap(error);
  }
}

/**
 * String() for error messages: objects without a usable primitive conversion
 * (null-prototype objects, Symbol.toPrimitive throwers) make String() itself
 * throw a raw TypeError, which would escape before the guard's branded error
 * is even constructed. Not exported from the package.
 */
export function showValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return `[unstringifiable ${typeof value}]`;
  }
}

function brandPrototype(ctor: { prototype: object }, brand: symbol): void {
  // defineProperty defaults: non-enumerable, non-writable, non-configurable —
  // the brand never leaks into JSON/spread and can't be reassigned.
  Object.defineProperty(ctor.prototype, brand, { value: true });
}

function formatIssues(issues: readonly Issue[]): string {
  return issues.map((issue) => `[${issue.key}] ${issue.message}`).join("; ");
}

function hasBrand(value: unknown, brand: symbol): boolean {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<symbol, unknown>)[brand] === true;
}
