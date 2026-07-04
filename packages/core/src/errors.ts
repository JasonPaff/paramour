export interface SearchIssue {
  readonly key: string;
  readonly message: string;
}

/** Base class for every error paramour throws. */
export class ParamourError extends Error {
  constructor(message: string) {
    super(message);
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
