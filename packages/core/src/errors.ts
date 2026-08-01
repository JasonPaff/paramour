/** One failed key in an aggregate decode error (shared by both surfaces). */
export interface Issue {
  /**
   * Bare shape label of the codec the key expected (`integer`,
   * `enum(asc|desc)`, `csv<integer>[]`). Absent when no codec owns the key:
   * rawSearch schema issues and foreign throws carry only prose.
   */
  readonly expected?: string;
  readonly key: string;
  readonly message: string;
  /**
   * What KIND of failure this issue records — the structured discriminant
   * renderers key on instead of sniffing `message` prose (see
   * {@link IssueReason} for the members). Core's decoders always set it;
   * it is optional only so prose-only issues built outside core (derived
   * tooling, hand-built test fixtures) remain representable — an absent
   * reason means "unclassified", and renderers must not infer one.
   */
  readonly reason?: IssueReason;
  /**
   * The offending value as the codec grammar saw it — the value-layer
   * string AFTER byte-layer percent-decoding, not the raw URL text. Search
   * sources (`URLSearchParams` / Next's `searchParams`) arrive
   * platform-decoded; route params are decoded by core (R5) before the
   * grammar runs — so a segment `1%20x` records `wire: "1 x"` on both
   * surfaces. Present only when a single offending value exists: absent
   * for missing keys, non-string source values, and the duplicate-scalar
   * rejection — absence there is the point, not a data gap.
   */
  readonly wire?: string;
}

/**
 * The failure kinds an {@link Issue} can record:
 *
 * - `"duplicate"` — a single-value param received multiple wire values (P5).
 * - `"missing"` — a required key had no wire value at all (including a
 *   required catch-all whose array arrived empty: the values are missing
 *   even though the key exists).
 * - `"parse"` — the codec's OWN wire grammar rejected the value; core's
 *   grammar messages quote the value and name the grammar themselves.
 * - `"shape"` — the source value's shape doesn't match the param kind (an
 *   array where a single segment belongs, a non-string element, …).
 * - `"validate"` — user-supplied code rejected the value (a Standard Schema
 *   validator, a custom codec's parse): its prose is not authored by core
 *   and may name neither the value nor the expected shape.
 */
export type IssueReason =
  "duplicate" | "missing" | "parse" | "shape" | "validate";

/** The single error type surfaced by a full route parse failure. */
export type RouteDecodeError = ParamsDecodeError | SearchDecodeError;

/**
 * Cross-copy identity brands. `Symbol.for()` keys resolve in the
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

/** Aggregate failure for a whole route-params decode. */
export class ParamsDecodeError extends ParamourError {
  static {
    brandPrototype(this, paramsDecodeErrorBrand);
  }

  readonly issues: readonly Issue[];
  /** The failed route's path pattern; null when decoded outside a route. */
  readonly route: null | string;

  constructor(issues: readonly Issue[], route: null | string = null) {
    super(formatDecodeMessage("route params", issues, route));
    this.issues = issues;
    this.route = route;
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

  /**
   * True when the message follows core's grammar-authoring convention —
   * it quotes the offending wire value and names the grammar it failed
   * (`'"x" is not an integer'`). Only core's own grammar throw sites set
   * it (via {@link grammarParseError}); schema-validation failures and
   * rebranded foreign/custom throws stay false, the safe default: an
   * unknown message is assumed to name neither, so renderers supply the
   * expected-shape context themselves. This flag — never message sniffing
   * — is what issue producers key `reason: "parse" | "validate"` on.
   */
  readonly selfDescribing: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; selfDescribing?: boolean },
  ) {
    super(message, options);
    this.selfDescribing = options?.selfDescribing ?? false;
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
  /** The failed route's path pattern; null when decoded outside a route. */
  readonly route: null | string;

  constructor(issues: readonly Issue[], route: null | string = null) {
    super(formatDecodeMessage("search params", issues, route));
    this.issues = issues;
    this.route = route;
  }

  static override [Symbol.hasInstance](
    value: unknown,
  ): value is SearchDecodeError {
    return hasBrand(value, searchDecodeErrorBrand);
  }
}

/**
 * A search source violated its wire-shape contract: a non-object source, or
 * a non-string / non-string[] value under a read key. Thrown by search.ts's
 * source readers; distinct from {@link ParamourError} so the Standard Schema
 * adapter can soften exactly these throws to issues while config-contract
 * violations and rebranded validator throws stay loud.
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
 * Best-effort human-readable message for a foreign (non-paramour) throw:
 * an `Error`'s message, else a {@link showValue}-hardened `String()` — safe
 * even for values whose primitive conversion itself throws (null-prototype
 * objects, `Symbol.toPrimitive` throwers). Public via `paramour/internal` so
 * derived tooling that catches user-code throws (the devtools panel's edit
 * preview) shares the hardening instead of re-implementing it minus the
 * guard.
 */
export function foreignMessage(error: unknown): string {
  return error instanceof Error ? error.message : showValue(error);
}

/**
 * A {@link ParseError} whose message follows core's grammar-authoring
 * convention: it quotes the offending wire value and names the expected
 * grammar (`'"x" is not an integer'`). The one sanctioned way to mint a
 * self-describing ParseError — every `p.*` grammar throw site goes through
 * it, so the convention is enforced by structure, not by prose review.
 * Not exported from the package.
 */
export function grammarParseError(message: string): ParseError {
  return new ParseError(message, { selfDescribing: true });
}

/**
 * Maps a caught {@link ParseError} to its {@link Issue} reason: core's
 * grammar-authored messages are `"parse"`, everything else — schema
 * validators, rebranded custom-codec throws — is `"validate"`. Keyed on the
 * structural `selfDescribing` flag, never on message sniffing; shared by
 * search.ts and path.ts so both surfaces classify identically. Not exported
 * from the package.
 */
export function parseIssueReason(error: ParseError): IssueReason {
  return error.selfDescribing ? "parse" : "validate";
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

/**
 * The aggregate decode message: a route-anchored header plus one `✖` line
 * per issue. Multi-line and pretty BY DEFAULT because the unhandled-throw
 * surfaces that matter (Next's dev overlay, terminal stacks) render
 * `error.message` verbatim — an opt-in `.pretty()` helper would never be
 * reached there. `(expected …)` is keyed on the issue's structured `reason`,
 * never on message/wire sniffing: it renders exactly where the message
 * cannot name the expected shape itself — a `"missing"` key has no value to
 * describe, and a `"validate"` failure carries foreign prose (schema
 * validators, custom parsers) with no authoring convention. Core's own
 * `"parse"` grammar messages already quote the value and name the grammar,
 * a `"duplicate"` or `"shape"` message states a problem that isn't about
 * the grammar at all, and a reason-less issue is unclassified prose — none
 * of those take the suffix.
 */
function formatDecodeMessage(
  subject: string,
  issues: readonly Issue[],
  route: null | string,
): string {
  const target = route === null ? subject : `${subject} for ${route}`;
  const lines = issues.map((issue) => {
    const expected =
      issue.expected !== undefined &&
      (issue.reason === "missing" || issue.reason === "validate")
        ? ` (expected ${issue.expected})`
        : "";
    return `  ✖ ${issue.key}: ${issue.message}${expected}`;
  });
  return [`Failed to decode ${target}:`, ...lines].join("\n");
}

function hasBrand(value: unknown, brand: symbol): boolean {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<symbol, unknown>)[brand] === true;
}
