/**
 * `@paramour-js/nuqs` — derives nuqs parsers from paramour codecs (design-10).
 *
 * A THIN seam (NQ1): one codec (or a route's whole search config) in,
 * ordinary nuqs parser currency out. Presence, defaults, catch recovery, and
 * equality are read off the codec's `~`-internals (NQ9) so nothing is ever
 * declared twice, and nuqs's own surface (`useQueryStates`, `withOptions`,
 * `createSerializer`, `createLoader`, the server cache) composes untouched.
 * `createParser`/`createMultiParser` are imported from `nuqs/server` on
 * purpose (NQ10): the root `nuqs` export pulls in the client hooks, and this
 * package must stay usable in server code.
 */
import {
  createMultiParser,
  createParser,
  type MultiParserBuilder,
  type SingleParserBuilder,
} from "nuqs/server";
import {
  type AnyCodec,
  type AnyRoute,
  isRawSearch,
  type OutputOf,
  ParamourError,
  ParseError,
  type SearchConfig,
  serializeValue,
} from "paramour";

declare const noTwinReason: unique symbol;

/**
 * Compile-time rejection marker (NQ8b): shapes with no faithful nuqs
 * translation make the `nuqsParser`/`nuqsParsers` ARGUMENT fail to compile
 * via an intersection with this brand, so the `Reason` literal surfaces in
 * the type error. The one symbol-keyed property is the whole mechanism: the
 * unexported symbol is unforgeable, so no runtime value inhabits the type,
 * and it carries `Reason` into the error text. The runtime `ParamourError`
 * backstops below make the same judgment for plain-JS callers (RL1 ethos:
 * contract violations are loud, never a silent null).
 */
export interface NoNuqsTwin<Reason extends string> {
  readonly [noTwinReason]: Reason;
}

/**
 * The parser map derived from a whole search config — ordinary nuqs currency
 * (NQ1). `-readonly` strips the modifier a route's `const`-inferred search
 * slot carries: the map is a fresh object the adapter builds, so
 * route-derived and bare-config-derived maps get the identical shape.
 */
export type NuqsParserMap<S extends SearchConfig> = {
  -readonly [K in keyof S]: NuqsParserOf<S[K]>;
};

/**
 * The nuqs parser derived from one codec. Per-key derivation (NQ3):
 * - arity-"many" → a multi (repeated-key) parser with `defaultValue: []`
 *   (NQ8a): absent and `[]` are the same wire state (S6/P6), so the nuqs
 *   read matches core's always-present array decode.
 * - value-form `.default(v)` → `withDefault`, non-nullable read (NQ5/NQ6).
 * - factory `.default(() => v)` → nullable (NQ6): the factory is
 *   time-varying by declaration; a frozen `withDefault` would lie. Apply
 *   the factory at the read site if you want the paramour-decoded shape.
 * - required or optional → nullable; nuqs's null is the correct reading of
 *   "absent" for both.
 * A hand-typed `Codec<…, "defaulted">` (its `~defaultElides` left at the
 * `boolean` default) falls to the nullable branch — the safe reading.
 *
 * The single `~defaultElides` probe subsumes a presence check: `E = true`
 * is only reachable through the value-form `.default()` overload, which
 * sets `~presence: "defaulted"` in the same return type (NQ6a).
 */
export type NuqsParserOf<C extends AnyCodec> = C["~arity"] extends "many"
  ? OutputOf<C> extends readonly unknown[]
    ? DefaultedMulti<OutputOf<C>>
    : never
  : C["~defaultElides"] extends true
    ? DefaultedSingle<OutputOf<C>>
    : SingleParserBuilder<OutputOf<C>>;

type CompatibleCodec<C extends AnyCodec> =
  null extends OutputOf<C>
    ? NoNuqsTwin<"codec output includes null, which nuqs reserves for absent/unparseable">
    : unknown;

type CompatibleConfig<S extends SearchConfig> = [keyof S] extends [never]
  ? NoNuqsTwin<"search config has no keys to derive nuqs parsers from">
  : [NullOutputKeys<S>] extends [never]
    ? unknown
    : NoNuqsTwin<`output of codec for key "${NullOutputKeys<S> & string}" includes null, which nuqs reserves for absent/unparseable`>;

type CompatibleRoute<R extends AnyRoute> = R["~search"] extends SearchConfig
  ? CompatibleConfig<R["~search"]>
  : NoNuqsTwin<"rawSearch routes validate the whole search object with one schema; there are no per-key codecs to derive nuqs parsers from">;

/** The non-nullable-read shapes `withDefault` produces (nuqs keys inference off `defaultValue`). */
type DefaultedMulti<Out extends readonly unknown[]> = ReturnType<
  MultiParserBuilder<Out>["withDefault"]
>;
type DefaultedSingle<Out> = ReturnType<SingleParserBuilder<Out>["withDefault"]>;

/**
 * Keys whose output type includes `null`: nuqs's parser contract overloads
 * null as "unparseable/absent", so a legitimately-null value would be
 * indistinguishable from a parse failure on the nuqs side (NQ8). Rejected
 * at the type level only — `~out` is phantom, so there is no runtime probe;
 * a null slipped past the types degrades to nuqs's native null semantics.
 */
type NullOutputKeys<S extends SearchConfig> = {
  [K in keyof S]: null extends OutputOf<S[K]> ? K : never;
}[keyof S];

type RouteParserMap<R extends AnyRoute> = R["~search"] extends SearchConfig
  ? NuqsParserMap<R["~search"]>
  : never;

/**
 * Derive a nuqs parser from one codec, exactly as it sits in a route's
 * search config — `.optional()`, `.default()`, `.catch()` already applied
 * (NQ3). Named after what comes out, mirroring nuqs's `parseAs*` vocabulary
 * from the call site's perspective (NQ2).
 */
export function nuqsParser<C extends AnyCodec>(
  codec: C & CompatibleCodec<C>,
): NuqsParserOf<C>;
export function nuqsParser(codec: unknown): unknown {
  return deriveParser(codec, null);
}

/**
 * Derive a whole nuqs parser map from a route object (routes-as-currency,
 * the common case) or a bare `SearchConfig` (standalone codec maps are
 * first-class in the framework-free core) — NQ2. The result is ordinary
 * nuqs currency: pass it to `useQueryStates`, `createSerializer`,
 * `createLoader`, or the server cache as-is (NQ1).
 */
export function nuqsParsers<R extends AnyRoute>(
  route: CompatibleRoute<R> & R,
): RouteParserMap<R>;
export function nuqsParsers<S extends SearchConfig>(
  config: CompatibleConfig<S> & S,
): NuqsParserMap<S>;
export function nuqsParsers(source: unknown): Record<string, unknown> {
  const config = resolveSearchConfig(source);
  // entries → fromEntries so keys like "__proto__" become ordinary own
  // properties of the result (core's decodeSearch precedent).
  return Object.fromEntries(
    Object.entries(config).map(([key, codec]) => [
      key,
      deriveParser(codec, key),
    ]),
  );
}

function deriveMany(codec: AnyCodec, key: null | string): unknown {
  const catchValue = codec["~catchValue"];
  const parseElement = codec["~parseElement"];
  const serialize = wireSerializer(codec, key);

  const parser = createMultiParser<unknown[]>({
    // NQ4 wire-form equality, element-wise: both sides serialize to the
    // same wire strings in the same order.
    eq: (a, b) =>
      a.length === b.length &&
      a.every((element, index) => serialize(element) === serialize(b[index])),
    parse(values) {
      try {
        return values.map((raw) => parseElement(raw));
      } catch (error) {
        // Whole-key recovery, mirroring decodeSearch's arity-many branch:
        // one bad element resolves the entire key to catch/null (NQ7/NQ8a).
        return recoverParse(error, catchValue) as null | unknown[];
      }
    },
    serialize: (value) => value.map((element) => serialize(element)),
  });
  // NQ8a: absent and [] are the same wire state for arity-many codecs
  // (S6/P6), so `withDefault([])` makes the nuqs read match core's decode
  // (arity-many keys are always present) and clearOnDefault([]) match
  // core's encode ([] emits nothing).
  return parser.withDefault([]);
}

function deriveParser(codec: unknown, key: null | string): unknown {
  requireCodec(codec, key);
  return codec["~arity"] === "many"
    ? deriveMany(codec, key)
    : deriveSingle(codec, key);
}

function deriveSingle(codec: AnyCodec, key: null | string): unknown {
  const catchValue = codec["~catchValue"];
  const parseElement = codec["~parseElement"];
  const serialize = wireSerializer(codec, key);

  const parser = createParser<unknown>({
    // NQ4: wire-form equality — the SAME judgment encodeSearch's D8 elision
    // makes, so nuqs's clearOnDefault and paramour's elision agree by
    // construction, for every codec kind including p.custom, with zero
    // per-kind logic and zero user-supplied comparators.
    eq: (a, b) => serialize(a) === serialize(b),
    parse(value) {
      try {
        return parseElement(value);
      } catch (error) {
        return recoverParse(error, catchValue);
      }
    },
    serialize,
  });

  // NQ6: only value-form defaults derive withDefault; clearOnDefault stays
  // ON (NQ5) because with NQ4's eq it is the same judgment as D8 elision.
  // The snapshot is read ONCE here — core's toThunk hands array defaults
  // out as fresh copies, so the frozen value is isolated; mutating a
  // reference-typed default after derivation is unsupported (README).
  // Factory defaults get NO withDefault: absent reads null, and the caller
  // applies the factory at the read site.
  if (
    codec["~presence"] === "defaulted" &&
    codec["~defaultElides"] &&
    codec["~defaultValue"] !== undefined
  ) {
    const snapshot: unknown = codec["~defaultValue"]();
    return parser.withDefault(snapshot as NonNullable<unknown>);
  }
  return parser;
}

/**
 * NQ7: .catch() parity first — a malformed value recovers exactly as the
 * server decode would — and only a codec without catch falls back to
 * nuqs's null. Only ParseError is translated (brand-based instanceof, so
 * cross-instance codecs work — NQ9); anything else, including a throwing
 * catch factory, propagates loud (the errors.ts taxonomy: contract
 * violations never masquerade as recoverable client state). One shared
 * helper on purpose, core's `recoverParseError` precedent: the single and
 * multi parsers must never drift on this judgment.
 */
function recoverParse(
  error: unknown,
  catchValue: (() => unknown) | undefined,
): unknown {
  if (error instanceof ParseError) {
    return catchValue === undefined ? null : catchValue();
  }
  throw error;
}

/**
 * Plain-JS backstop: structural probe for the two function-typed internals
 * every codec carries. Structural on purpose — codecs from a second
 * physical copy of core must pass (NQ9); version-skew safety comes from the
 * dependency shape (NQ10), not runtime checks.
 */
function requireCodec(
  value: unknown,
  key: null | string,
): asserts value is AnyCodec {
  const probe = value as null | Record<string, unknown> | undefined;
  if (
    typeof probe?.["~parseElement"] !== "function" ||
    typeof probe["~serializeElement"] !== "function"
  ) {
    throw new ParamourError(
      key === null
        ? "nuqsParser expects a paramour codec"
        : `search config value for key "${key}" is not a paramour codec`,
    );
  }
}

function resolveSearchConfig(source: unknown): Record<string, unknown> {
  if (typeof source !== "object" || source === null) {
    throw new ParamourError(
      `nuqsParsers expects a route or search config object, got ${source === null ? "null" : typeof source}`,
    );
  }
  // Route detection probes the brand's VALUE, not mere key presence: wire
  // keys are arbitrary strings (a config key literally named "~router" is
  // legal and round-trips through core), but only a route carries a
  // RouterKind string there — a config's value would be a codec object.
  // Same value-shape discipline as core's isRawSearch.
  const record = source as Record<string, unknown>;
  const config: unknown =
    typeof record["~router"] === "string" ? record["~search"] : record;
  if (typeof config !== "object" || config === null) {
    throw new ParamourError(
      "no search codecs to derive nuqs parsers from (missing search config)",
    );
  }
  if (isRawSearch(config as SearchConfig)) {
    // NQ8b runtime backstop: rawSearch validates the whole search object
    // with one schema — there are no per-key codecs to derive from.
    throw new ParamourError(
      "rawSearch routes validate the whole search object with one schema; there are no per-key codecs to derive nuqs parsers from",
    );
  }
  if (Object.keys(config).length === 0) {
    throw new ParamourError(
      "no search codecs to derive nuqs parsers from (empty search config)",
    );
  }
  return config as Record<string, unknown>;
}

/**
 * Curries core's `serializeValue` for one codec: eq and D8 elision must
 * make the same judgment on the same wire strings, so a plain-JS custom
 * serializer returning a non-string is a loud SerializeError on both sides
 * — never a silent `"undefined"` comparison. Sharing core's implementation
 * (not a local copy) is what makes that parity hold by construction (NQ4).
 */
function wireSerializer(
  codec: AnyCodec,
  key: null | string,
): (value: unknown) => string {
  const label = key === null ? "this codec" : `search param "${key}"`;
  return (value) => serializeValue(codec, label, value);
}
