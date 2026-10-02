/**
 * `@paramour-js/nuqs` — derives nuqs parsers from paramour codecs.
 *
 * A THIN seam: one codec (or a route's whole search config) in, ordinary
 * nuqs parser currency out. Presence, defaults, catch recovery, and equality
 * are read off the codec's `~`-internals so nothing is ever declared twice,
 * and nuqs's own surface (`useQueryStates`, `withOptions`,
 * `createSerializer`, `createLoader`, the server cache) composes untouched.
 * `createParser`/`createMultiParser` are imported from `nuqs/server` on
 * purpose: the root `nuqs` export pulls in the client hooks, and this
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
  type Codec,
  describeCodec,
  formatCodecDescription,
  type InferCodecOutput,
  isRawSearch,
  p,
  ParamourError,
  ParseError,
  type SearchConfig,
  SerializeError,
  serializeValue,
} from "paramour";

declare const noTwinReason: unique symbol;

/** nuqs's `parseAsArrayOf` default separator, and its in-element escape. */
const SEPARATOR = ",";
const ENCODED_SEPARATOR = encodeURIComponent(SEPARATOR);

/**
 * Compile-time rejection marker: shapes with no faithful nuqs translation
 * make the `nuqsParser`/`nuqsParsers` ARGUMENT fail to compile via an
 * intersection with this brand, so the `Reason` literal surfaces in the type
 * error. The one symbol-keyed property is the whole mechanism: the
 * unexported symbol is unforgeable, so no runtime value inhabits the type,
 * and it carries `Reason` into the error text. The runtime `ParamourError`
 * backstops below make the same judgment for plain-JS callers — contract
 * violations are loud, never a silent null.
 */
export interface NoNuqsTwin<Reason extends string> {
  readonly [noTwinReason]: Reason;
}

/**
 * The parser map derived from a whole search config — ordinary nuqs
 * currency. `-readonly` strips the modifier a route's `const`-inferred
 * search slot carries: the map is a fresh object the adapter builds, so
 * route-derived and bare-config-derived maps get the identical shape.
 */
export type NuqsParserMap<S extends SearchConfig> = {
  -readonly [K in keyof S]: NuqsParserOf<S[K]>;
};

/**
 * The nuqs parser derived from one codec, key by key:
 * - arity-"many" → a multi (repeated-key) parser with `defaultValue: []`:
 *   absent and `[]` are the same wire state (S6/P6), so the nuqs read
 *   matches core's always-present array decode.
 * - value-form `.default(v)` → `withDefault`, non-nullable read.
 * - factory `.default(() => v)` → nullable: the factory is time-varying by
 *   declaration; a frozen `withDefault` would lie. Apply the factory at the
 *   read site if you want the paramour-decoded shape.
 * - required or optional → nullable; nuqs's null is the correct reading of
 *   "absent" for both.
 * A hand-typed `Codec<…, "defaulted">` (its `~defaultElides` left at the
 * `boolean` default) falls to the nullable branch — the safe reading.
 *
 * The single `~defaultElides` probe subsumes a presence check: `E = true`
 * is only reachable through the value-form `.default()` overload, which
 * sets `~presence: "defaulted"` in the same return type.
 */
export type NuqsParserOf<C extends AnyCodec> = C["~arity"] extends "many"
  ? InferCodecOutput<C> extends readonly unknown[]
    ? DefaultedMulti<InferCodecOutput<C>>
    : never
  : C["~defaultElides"] extends true
    ? DefaultedSingle<InferCodecOutput<C>>
    : SingleParserBuilder<InferCodecOutput<C>>;

type CompatibleCodec<C extends AnyCodec> =
  null extends InferCodecOutput<C>
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
 * indistinguishable from a parse failure on the nuqs side. Rejected at the
 * type level only — `~out` is phantom, so there is no runtime probe; a null
 * slipped past the types degrades to nuqs's native null semantics.
 */
type NullOutputKeys<S extends SearchConfig> = {
  [K in keyof S]: null extends InferCodecOutput<S[K]> ? K : never;
}[keyof S];

type RouteParserMap<R extends AnyRoute> = R["~search"] extends SearchConfig
  ? NuqsParserMap<R["~search"]>
  : never;

/**
 * A one-key list in nuqs's `parseAsArrayOf(itemParser)` wire format, as a
 * paramour codec — for routes whose URLs nuqs already wrote, or must keep
 * reading. `p.csv` is paramour's own one-key list and is strict on purpose;
 * this is the compatibility twin, and it copies nuqs's two deliberate
 * differences:
 * - a comma inside an element is escaped as the literal text `%2C` instead
 *   of being rejected, so lists of free-text values (names with commas) fit;
 * - an element that fails to parse is dropped on its own instead of failing
 *   the whole key, and an empty segment is handed to the element codec like
 *   any other (`p.string()` keeps it, `p.enum()` drops it).
 *
 * nuqs's escaping is lossy in exactly two places, and serialize rejects
 * both with a `SerializeError` rather than emit a URL that reads back as a
 * different list: an element whose wire form already contains `%2C` (it
 * would come back with a comma), and a sole element whose wire form is
 * empty (the empty wire string reads back as `[]`). Beyond those, the two
 * agree on every URL as long as nuqs uses its default `,` separator and the
 * element codec accepts the same text as nuqs's element parser.
 *
 * Elements are unmodified scalars, as for `p.csv`: modifiers belong on the
 * list (`nuqsArrayOf().default([])`), which is an ordinary single-arity
 * codec and derives an ordinary nuqs parser.
 */
export function nuqsArrayOf<E = string>(element?: Codec<E>): Codec<E[]> {
  const inner = resolveArrayElement(element);
  const parseElement = inner["~parseElement"];
  const serializeElement = inner["~serializeElement"];
  return p.custom<E[]>({
    // Named after the element like core's composites (`csv<integer>`), so
    // `paramour list` and devtools show what the list holds.
    label: `nuqsArrayOf<${formatCodecDescription(describeCodec(inner), "shape")}>`,
    parse(raw) {
      if (raw === "") return [];
      const values: E[] = [];
      for (const segment of raw.split(SEPARATOR)) {
        try {
          values.push(
            parseElement(segment.replaceAll(ENCODED_SEPARATOR, SEPARATOR)) as E,
          );
        } catch (error) {
          // nuqs drops a failing element and keeps the rest. Only a
          // ParseError is a failing element; anything else is a contract
          // violation and stays loud, as in recoverParse.
          if (!(error instanceof ParseError)) throw error;
        }
      }
      return values;
    },
    serialize(values) {
      // Plain-JS backstop, matching p.csv's message for a non-array value.
      const list: unknown = values;
      if (!Array.isArray(list)) {
        throw new SerializeError(`Expected an array, got ${typeof list}`);
      }
      const segments = values.map((value) => {
        const wire = serializeElement(value);
        if (typeof wire !== "string") {
          throw new SerializeError(
            "Expected the element to serialize to a string",
          );
        }
        if (wire.includes(ENCODED_SEPARATOR)) {
          throw new SerializeError(
            `Element ${JSON.stringify(wire)} contains the literal text "${ENCODED_SEPARATOR}", which nuqs's list format would read back as a comma`,
          );
        }
        return wire.replaceAll(SEPARATOR, ENCODED_SEPARATOR);
      });
      if (segments.length === 1 && segments[0] === "") {
        throw new SerializeError(
          "A list holding one empty element cannot be written: the empty wire string reads back as []",
        );
      }
      return segments.join(SEPARATOR);
    },
  });
}

/**
 * Derive a nuqs parser from one codec, exactly as it sits in a route's
 * search config — `.optional()`, `.default()`, `.catch()` already applied.
 * Named after what comes out, mirroring nuqs's `parseAs*` vocabulary from
 * the call site's perspective.
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
 * first-class in the framework-free core). The result is ordinary nuqs
 * currency: pass it to `useQueryStates`, `createSerializer`,
 * `createLoader`, or the server cache as-is.
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
    // Wire-form equality, element-wise: both sides serialize to the same
    // wire strings in the same order.
    eq: (a, b) =>
      a.length === b.length &&
      a.every((element, index) => serialize(element) === serialize(b[index])),
    parse(values) {
      try {
        return values.map((raw) => parseElement(raw));
      } catch (error) {
        // Whole-key recovery, mirroring decodeSearch's arity-many branch:
        // one bad element resolves the entire key to catch/null.
        return recoverParse(error, catchValue) as null | unknown[];
      }
    },
    serialize: (value) => value.map((element) => serialize(element)),
  });
  // Absent and [] are the same wire state for arity-many codecs (S6/P6),
  // so `withDefault([])` makes the nuqs read match core's decode
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
    // Wire-form equality — the SAME judgment encodeSearch's D8 elision
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

  // Only value-form defaults derive withDefault; clearOnDefault stays ON
  // because with wire-form eq it is the same judgment as D8 elision.
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
 * .catch() parity first — a malformed value recovers exactly as the server
 * decode would — and only a codec without catch falls back to nuqs's null.
 * Only ParseError is translated (brand-based instanceof, so cross-instance
 * codecs work); anything else, including a throwing catch factory,
 * propagates loud (the errors.ts taxonomy: contract violations never
 * masquerade as recoverable client state). One shared helper on purpose,
 * core's `recoverParseError` precedent: the single and multi parsers must
 * never drift on this judgment.
 */
function recoverParse(
  error: unknown,
  catchValue: (() => unknown) | undefined,
): unknown {
  if (error instanceof ParseError) {
    // An optional codec may recover to absent (`.catch(undefined)`); nuqs
    // spells absent `null`, so the fallback maps onto it.
    return catchValue?.() ?? null;
  }
  throw error;
}

/**
 * Plain-JS backstop: structural probe for the two function-typed internals
 * every codec carries. Structural on purpose — codecs from a second
 * physical copy of core must pass; version-skew safety comes from the
 * dependency shape, not runtime checks.
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

/**
 * Runtime mirror of `nuqsArrayOf`'s `Codec<E>` parameter type, for plain-JS
 * callers: only the element's parse/serialize functions are captured, so a
 * modifier on it would be silently dropped rather than applied. Same
 * judgment as core's `p.csv` element admission. Arity-many inners are
 * excluded because they have no single wire string to put in a segment.
 */
function resolveArrayElement(element: AnyCodec | undefined): AnyCodec {
  if (element === undefined) return p.string();
  requireCodec(element, null);
  if (
    element["~arity"] === "many" ||
    element["~caught"] ||
    element["~presence"] !== "required"
  ) {
    throw new ParamourError(
      "nuqsArrayOf() elements cannot carry modifiers (.optional()/.default()/.catch()) or be array codecs",
    );
  }
  return element;
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
    // Runtime backstop: rawSearch validates the whole search object
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
 * (not a local copy) is what makes that parity hold by construction.
 */
function wireSerializer(
  codec: AnyCodec,
  key: null | string,
): (value: unknown) => string {
  const label = key === null ? "this codec" : `search param "${key}"`;
  return (value) => serializeValue(codec, label, value);
}
