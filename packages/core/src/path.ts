import type { AnyCodec } from "./codec.js";
import type {
  AnyRoute,
  CatchAllNames,
  InferRouteParams,
  OptionalCatchAllNames,
  ParamOutput,
  SingleParamNames,
} from "./route.js";

import {
  type Issue,
  ParamourError,
  ParamsDecodeError,
  ParseError,
  SerializeError,
} from "./errors.js";
import { encodeComponent, readInputValue } from "./search.js";

/**
 * Encode-input side of a route's params (RL3's href-input column): `[id]` →
 * `Out` (required), `[...slug]` → `Out[]` (required — `[]` is an R3
 * serialization error), `[[...path]]` → `Out[]` with an OPTIONAL key, per
 * the spike-01 follow-up under exactOptionalPropertyTypes. Module-level
 * export only; Block 3's `InferHrefInput` builds on it.
 */
export type InferParamsInput<R extends AnyRoute> = {
  [K in CatchAllNames<R["path"]>]: ParamOutput<R["~params"], K>[];
} & {
  [K in OptionalCatchAllNames<R["path"]>]?: ParamOutput<R["~params"], K>[];
} & {
  [K in SingleParamNames<R["path"]>]: ParamOutput<R["~params"], K>;
};

/**
 * Decoded value-layer params source (wire spec §1, R5): the shape of Next's
 * `params` prop. Values are already percent-decoded by the platform.
 */
export type ParamsSource = Record<string, string | string[] | undefined>;

/** One parsed path segment, as produced by {@link tokenizePath}. */
export type PathSegment =
  | {
      readonly kind: "catchall" | "optional-catchall" | "single";
      readonly name: string;
      readonly raw: string;
    }
  | { readonly kind: "static"; readonly raw: string };

// Anchored per the wire-format spec's regex ethos; name charset excludes
// brackets so nesting can't smuggle through. Match order mirrors the type
// grammar: `[[...` before `[...` before `[`.
const OPTIONAL_CATCHALL_TOKEN = /^\[\[\.\.\.([^\][]+)\]\]$/;
const CATCHALL_TOKEN = /^\[\.\.\.([^\][]+)\]$/;
const SINGLE_TOKEN = /^\[([^\][]+)\]$/;
const GROUP_SEGMENT = /^\(.*\)$/;

/**
 * Builds the path portion of an href (RL5): `/` plus the encoded segments
 * joined with `/`. R2's element joining falls out of the same join as
 * everything else; a fully-elided path (an optional catch-all at the root)
 * yields "/".
 */
export function buildPath<R extends AnyRoute>(
  route: R,
  params: InferParamsInput<R>,
): string {
  return `/${encodeParams(route, params).join("/")}`;
}

/**
 * Decodes a params source against a route's codecs (RL7), the sync twin of
 * `route.parseParams` — mirrors decodeSearch: per-key {@link Issue}
 * aggregation into {@link ParamsDecodeError}. Shape validation is strict:
 * `[id]` given an array, a catch-all given a string, a missing required key,
 * or a non-string element are recorded issues, and NOT `.catch()`-recoverable
 * — a shape mismatch means the props came from a route this definition
 * doesn't describe. Unknown source keys are never read (P8's spirit; Next
 * includes parent-layout params).
 */
export function decodeParams<R extends AnyRoute>(
  route: R,
  source: ParamsSource,
): InferRouteParams<R> {
  // The TS contract forbids non-object sources, but plain-JS callers reach
  // here; fail branded and loud — a bad source is a contract violation, not
  // a per-key decode issue.
  const untrusted: unknown = source;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new ParamourError(
      `params source must be an object, got ${untrusted === null ? "null" : typeof untrusted}`,
    );
  }
  const config = route["~params"] as Record<string, AnyCodec | undefined>;
  const issues: Issue[] = [];
  // Built as entries so keys like "__proto__" become ordinary own properties
  // of the result (Object.fromEntries uses define, not set, semantics).
  const entries: [string, unknown][] = [];

  for (const segment of tokenizePath(route.path)) {
    if (segment.kind === "static") continue;
    const codec = requireCodec(config, segment.name, route.path);
    // Own properties only: unknown keys are never read, and inherited
    // Object.prototype members must not count as present values.
    const value = Object.hasOwn(source, segment.name)
      ? source[segment.name]
      : undefined;

    if (segment.kind === "single") {
      if (value === undefined) {
        issues.push({
          key: segment.name,
          message: "required route param is missing",
        });
      } else if (typeof value !== "string") {
        // RL7: shape mismatches are recorded issues, never ParseErrors —
        // .catch() cannot recover them.
        issues.push({
          key: segment.name,
          message: `expected a single segment value, got ${Array.isArray(value) ? "an array" : typeof value}`,
        });
      } else {
        try {
          entries.push([segment.name, codec["~parseElement"](value)]);
        } catch (error) {
          // Per-key recovery, as in decodeSearch: .catch() only ever
          // recovers parse *failures* (D2), never absence or shape.
          if (
            error instanceof ParseError &&
            codec["~catchValue"] !== undefined
          ) {
            entries.push([segment.name, codec["~catchValue"]()]);
          } else if (error instanceof ParseError) {
            issues.push({ key: segment.name, message: error.message });
          } else {
            throw error;
          }
        }
      }
      continue;
    }

    if (value === undefined) {
      if (segment.kind === "optional-catchall") {
        // Absent [[...x]] → [] (D6 normalization).
        entries.push([segment.name, []]);
      } else {
        issues.push({
          key: segment.name,
          message: "required route param is missing",
        });
      }
      continue;
    }
    if (!Array.isArray(value)) {
      issues.push({
        key: segment.name,
        message: `expected catch-all values (an array), got ${typeof value}`,
      });
      continue;
    }
    if (segment.kind === "catchall" && value.length === 0) {
      // RL7: no URL produces a present-but-empty required catch-all; only
      // hand-built props can — mirrors R3's encode-side stance.
      issues.push({
        key: segment.name,
        message: "required catch-all received no segment values",
      });
      continue;
    }
    // Copy FIRST, then validate and parse the copy (search.ts's snapshot
    // ethos: impure index getters can't present strings to validation yet
    // deliver junk to the codec).
    const elements: unknown[] = [...(value as unknown[])];
    const parsed: unknown[] = [];
    let failed = false;
    for (const [index, element] of elements.entries()) {
      if (typeof element !== "string") {
        issues.push({
          key: segment.name,
          message: `element ${String(index)}: expected a string, got ${typeof element}`,
        });
        failed = true;
        continue;
      }
      try {
        parsed.push(codec["~parseElement"](element));
      } catch (error) {
        // Element-wise recovery (RL7, forced by D6): the codec describes ONE
        // element, so a .catch() fallback is element-typed — each failing
        // element recovers independently ("1","x","3" → 1, fallback, 3).
        if (error instanceof ParseError && codec["~catchValue"] !== undefined) {
          parsed.push(codec["~catchValue"]());
        } else if (error instanceof ParseError) {
          issues.push({
            key: segment.name,
            message: `element ${String(index)}: ${error.message}`,
          });
          failed = true;
        } else {
          throw error;
        }
      }
    }
    if (!failed) entries.push([segment.name, parsed]);
  }

  if (issues.length > 0) {
    throw new ParamsDecodeError(issues);
  }
  return Object.fromEntries(entries) as InferRouteParams<R>;
}

/**
 * Encodes a params input into ordered, already-percent-encoded URL segment
 * strings (RL5) — ONE entry per emitted URL segment: a static segment is
 * emitted verbatim, a single param contributes one entry (R1), a catch-all
 * one per element (R2), an elided optional catch-all none (R3). Codec
 * serialize errors and schema-refinement failures (N9) propagate unchanged,
 * already branded at their own chokepoints.
 */
export function encodeParams<R extends AnyRoute>(
  route: R,
  params: InferParamsInput<R>,
): string[] {
  // The TS contract forbids non-object inputs, but plain-JS callers reach
  // here; a null input must fail loud, not read as every-param-absent.
  const untrusted: unknown = params;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new SerializeError(
      `params input must be an object, got ${untrusted === null ? "null" : typeof untrusted}`,
    );
  }
  const values = untrusted as Record<string, unknown>;
  const config = route["~params"] as Record<string, AnyCodec | undefined>;
  const segments: string[] = [];

  for (const segment of tokenizePath(route.path)) {
    if (segment.kind === "static") {
      // RL2/RL5: the literal is URL-shaped and emitted as-is — static
      // segments are never re-encoded.
      segments.push(segment.raw);
      continue;
    }
    const codec = requireCodec(config, segment.name, route.path);
    const value = readInputValue(values, segment.name);

    if (segment.kind === "single") {
      if (value === undefined) {
        throw new SerializeError(
          `required route param "${segment.name}" is missing`,
        );
      }
      // R1: one value, one segment.
      segments.push(encodeSegmentValue(codec, segment.name, value));
      continue;
    }

    if (
      segment.kind === "optional-catchall" &&
      (value === undefined || (Array.isArray(value) && value.length === 0))
    ) {
      // R3: [[...x]] given [] or absent emits no segments — the segment and
      // its preceding "/" vanish, leaving the base path.
      continue;
    }
    if (value === undefined) {
      throw new SerializeError(
        `required route param "${segment.name}" is missing`,
      );
    }
    if (!Array.isArray(value)) {
      throw new SerializeError(
        `route param "${segment.name}" expects an array, got ${typeof value}`,
      );
    }
    if (value.length === 0) {
      // R3: a required catch-all given [] is a serialization error — Next
      // has no route for it.
      throw new SerializeError(
        `catch-all route param "${segment.name}" received an empty array`,
      );
    }
    // R2: each element is encoded independently; an element containing "/"
    // becomes %2F and must round-trip as a single element (the E2E decode
    // caveat is wire-spec open item 1, owned by @paramour/next).
    for (const element of value) {
      segments.push(encodeSegmentValue(codec, segment.name, element));
    }
  }

  return segments;
}

/**
 * Tokenizes a path literal into segments, throwing ParamourError on every
 * RL1 rejection. Shared by defineRoute (define-time validation) and the
 * R-rule runtime here, so encode/decode never re-derive segment kinds.
 */
export function tokenizePath(path: string): PathSegment[] {
  // RL1: either would corrupt href's fixed path–query–fragment assembly (RL4).
  if (path.includes("?")) {
    throw new ParamourError(
      `route path must not contain "?": "${path}" (declare search params in the search config)`,
    );
  }
  if (path.includes("#")) {
    throw new ParamourError(
      `route path must not contain "#": "${path}" (pass fragments to href() via its hash option)`,
    );
  }
  if (!path.startsWith("/")) {
    throw new ParamourError(`route path must start with "/": "${path}"`);
  }
  if (path !== "/" && path.endsWith("/")) {
    throw new ParamourError(`route path must not end with "/": "${path}"`);
  }
  if (path === "/") return [];

  const segments: PathSegment[] = [];
  const seen = new Set<string>();
  for (const raw of path.slice(1).split("/")) {
    if (raw === "") {
      throw new ParamourError(
        `route path contains an empty segment: "${path}"`,
      );
    }
    // RL2: path literals are URL-shaped, so group/slot spellings are
    // filesystem paths by definition — the most likely migration mistake.
    if (GROUP_SEGMENT.test(raw)) {
      throw new ParamourError(
        `route paths are URL-shaped: "${raw}" in "${path}" is a route-group folder name; use the URL path without it`,
      );
    }
    if (raw.startsWith("@")) {
      throw new ParamourError(
        `route paths are URL-shaped: "${raw}" in "${path}" is a parallel-route slot; define the parent route instead`,
      );
    }
    const segment = tokenizeSegment(raw, path);
    if (segment.kind !== "static") {
      // RL1: not expressible as a compile error — the mapped type silently
      // collapses duplicate keys.
      if (seen.has(segment.name)) {
        throw new ParamourError(
          `route path declares param "${segment.name}" more than once: "${path}"`,
        );
      }
      seen.add(segment.name);
    }
    segments.push(segment);
  }

  segments.forEach((segment, index) => {
    // RL1: Next itself requires catch-alls to be final.
    if (
      (segment.kind === "catchall" || segment.kind === "optional-catchall") &&
      index < segments.length - 1
    ) {
      throw new ParamourError(
        `catch-all segment "${segment.raw}" must be the final segment: "${path}"`,
      );
    }
  });

  return segments;
}

/**
 * Serializes one segment value into its percent-encoded wire form. Enforces
 * the serializer's string contract exactly as search.ts's serializeValue
 * does — a plain-JS custom codec returning a non-string must never reach the
 * byte layer as the literal text "undefined".
 */
function encodeSegmentValue(
  codec: AnyCodec,
  name: string,
  value: unknown,
): string {
  const serialized: unknown = codec["~serializeElement"](value);
  if (typeof serialized !== "string") {
    throw new SerializeError(
      `serializer for route param "${name}" must return a string, got ${typeof serialized}`,
    );
  }
  if (serialized === "") {
    // R4: "" would produce "//" or a vanishing segment — same rationale as R3.
    throw new SerializeError(
      `route param "${name}" serialized to an empty string, which cannot form a path segment`,
    );
  }
  // Byte layer: encodeComponent brands lone-surrogate URIErrors (S7).
  return encodeComponent(serialized);
}

/**
 * Unreachable through defineRoute's typed config; a plain-JS caller can omit
 * a param codec, which is a config-contract failure, not a decode issue.
 */
function requireCodec(
  config: Record<string, AnyCodec | undefined>,
  name: string,
  path: string,
): AnyCodec {
  const codec = config[name];
  if (codec === undefined) {
    throw new ParamourError(
      `route "${path}" declares no codec for param "${name}"`,
    );
  }
  return codec;
}

function tokenizeSegment(raw: string, path: string): PathSegment {
  const optionalCatchAll = OPTIONAL_CATCHALL_TOKEN.exec(raw);
  if (optionalCatchAll?.[1] !== undefined) {
    return { kind: "optional-catchall", name: optionalCatchAll[1], raw };
  }
  const catchAll = CATCHALL_TOKEN.exec(raw);
  if (catchAll?.[1] !== undefined) {
    return { kind: "catchall", name: catchAll[1], raw };
  }
  // Mirrors SingleParamNames' catch-all exclusion: a `[...`-prefixed segment
  // that failed the catch-all regex (only `[...]`, since the name charset
  // already bans brackets) must fall through to malformed, or the runtime
  // would mint a single param named "..." where the type layer sees static.
  const single = SINGLE_TOKEN.exec(raw);
  if (!raw.startsWith("[...") && single?.[1] !== undefined) {
    return { kind: "single", name: single[1], raw };
  }
  // RL1: the type layer lets these fall through as static text (RL3), and
  // pre-generation there is no registry to catch them; href would otherwise
  // emit the token verbatim.
  if (raw.includes("[") || raw.includes("]")) {
    throw new ParamourError(
      `malformed dynamic segment "${raw}" in "${path}": expected [name], [...name], or [[...name]]`,
    );
  }
  return { kind: "static", raw };
}
