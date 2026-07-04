export interface SearchIssue {
  readonly key: string;
  readonly message: string;
}

/** Base class for every error paramour throws. */
export class ParamourError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * A single wire value failed its codec grammar or schema validation.
 * Thrown by element-level parsing; recoverable via `.catch()`.
 */
export class ParseError extends ParamourError {}

/** Aggregate failure for a whole search-params decode. */
export class SearchDecodeError extends ParamourError {
  readonly issues: readonly SearchIssue[];

  constructor(issues: readonly SearchIssue[]) {
    super(
      `Failed to decode search params: ${issues
        .map((issue) => `[${issue.key}] ${issue.message}`)
        .join("; ")}`,
    );
    this.issues = issues;
  }
}

/** A value could not be serialized to the wire (bad type, non-finite, etc.). */
export class SerializeError extends ParamourError {}

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
