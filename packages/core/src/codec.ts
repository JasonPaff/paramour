import {
  foreignMessage,
  ParamourError,
  ParseError,
  rebrandForeign,
} from "./errors.js";

/**
 * `any` is deliberate: `~out` appears in inferred method parameter positions
 * (`.default(value: Out)`), which are contravariant under strictFunctionTypes;
 * the `unknown` form would reject every concrete codec.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCodec = Codec<any, Presence, boolean, Arity>;

/** "single" = one wire value per key; "many" = repeated keys (arrays). */
export type Arity = "many" | "single";

/**
 * A bidirectional wire codec.
 *
 * `Out` is the decoded in-memory type. `P`, `C`, `A`, and `E` are type-state:
 * modifier methods are conditionally `never`, so illegal chains
 * (`.optional().default()`, double `.catch()`) fail to compile (design-02 D3).
 * `E` carries `~defaultElides` as a literal after `.default()` (NQ6a).
 * Presence modifiers are also `never` for arity-"many" codecs: absent and `[]`
 * are the same wire state (S6/P6), so `.default()`/`.optional()` could never
 * round-trip there.
 *
 * `.default()` and `.catch()` accept either a value or a zero-arg factory;
 * factories are invoked per decode/encode, so reference-typed defaults can be
 * isolated per call. Array values are shallow-copied per call for the same
 * isolation; other plain object values are returned by reference.
 *
 * Properties prefixed `~` are internal machinery, not public API. For
 * arity-"many" codecs the element functions operate on single elements of
 * `Out` (which is an array type).
 */
export interface Codec<
  Out,
  P extends Presence = "required",
  C extends boolean = false,
  A extends Arity = "single",
  E extends boolean = boolean,
> {
  readonly catch: C extends false
    ? (fallback: (() => Out) | Out) => Codec<Out, P, true, A, E>
    : never;
  /**
   * Overloaded so the value/factory split is visible in type-state (NQ6a):
   * the factory overload comes FIRST and must stay first. The runtime
   * {@link isFactory} check treats ANY function as a factory, so a function
   * argument must either match the factory overload or fail to compile
   * ({@link NonFactoryValue}) — E=true is only ever inferred for arguments
   * the runtime will also treat as values. The one statically-invisible
   * residue: an argument whose static type is not a function (e.g.
   * `unknown`) but holds one at runtime lands on the runtime's factory
   * branch anyway; no type-level check can see that.
   */
  readonly default: A extends "single"
    ? P extends "required"
      ? {
          (value: () => Out): Codec<Out, "defaulted", C, A, false>;
          <V extends Out>(
            value: NonFactoryValue<V> & V,
          ): Codec<Out, "defaulted", C, A, true>;
        }
      : never
    : never;
  readonly optional: A extends "single"
    ? P extends "required"
      ? () => Codec<Out, "optional", C, A, E>
      : never
    : never;
  readonly "~arity": A;
  /** Stored as a thunk regardless of the form passed to `.catch()`. */
  readonly "~catchValue": (() => Out) | undefined;
  readonly "~caught": C;
  /**
   * True when `.default()` received a value (not a factory). Value defaults
   * participate in D8 elision, compared against the live default
   * re-serialized per encode. Factory defaults never elide: a time-varying
   * factory would elide an explicitly-passed value that later decodes as a
   * different one.
   *
   * Literal-typed via `E` (NQ6a) so derived surfaces (`@paramour-js/nuqs`)
   * can give value-defaulted keys non-nullable reads while keeping
   * factory-defaulted keys honestly nullable. A hand-written
   * `Codec<…, "defaulted">` leaves `E` at its `boolean` default, which
   * consumers must treat as the factory (nullable) branch — the safe
   * reading.
   */
  readonly "~defaultElides": E;
  /** Stored as a thunk regardless of the form passed to `.default()`. */
  readonly "~defaultValue": (() => Out) | undefined;
  /**
   * Element codec of a composite list codec (`p.csv`, `p.array`) — the
   * per-segment/per-key scalar; undefined for every non-composite kind (CV6).
   */
  readonly "~element": AnyCodec | undefined;
  /** Members of a `p.enum` codec; undefined for every other kind. */
  readonly "~enumMembers": readonly string[] | undefined;
  /**
   * Which builder produced the codec (`"integer"`, `"enum"`, …; `p.custom`
   * uses its `label` or `"custom"`). Reflection metadata for describeCodec —
   * never consulted by parse/serialize.
   */
  readonly "~kind": string;
  /** phantom — carries `Out` for inference; never set at runtime */
  readonly "~out": Out;

  readonly "~parseElement": (raw: string) => unknown;
  readonly "~presence": P;
  readonly "~serializeElement": (value: unknown) => string;
}

export type OutputOf<C extends AnyCodec> = C["~out"];

/** Codecs legal in a `params:` config — no presence modifiers (design-02 D5). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParamCodec = Codec<any, "required", boolean>;

/**
 * Presence governs absence semantics and property optionality on both the
 * parse-output and href-input sides (design-02 D4). Catch is orthogonal:
 * it recovers parse *failures*, never absence (D2).
 */
export type Presence = "defaulted" | "optional" | "required";
export type PresenceOf<C extends AnyCodec> = C["~presence"];

interface CodecState<Out> {
  readonly arity: Arity;
  readonly catchValue: (() => Out) | undefined;
  readonly defaultElides: boolean;
  readonly defaultValue: (() => Out) | undefined;
  readonly element: AnyCodec | undefined;
  readonly enumMembers: readonly string[] | undefined;
  readonly kind: string;
  readonly parseElement: (raw: string) => unknown;
  readonly presence: Presence;
  readonly serializeElement: (value: unknown) => string;
}

/**
 * Rejects value-form `.default()` arguments whose static type includes any
 * function member: runtime {@link isFactory} would treat them as factories,
 * so letting them infer the value branch would let type-state assert an
 * elision (`E = true`) the runtime never performs (NQ6a). Non-distributive
 * on purpose — a union with a function member is rejected whole, since its
 * runtime branch is unknowable at compile time.
 */
type NonFactoryValue<V> = [Extract<V, (...args: never[]) => unknown>] extends [
  never,
]
  ? unknown
  : never;

/** Internal factory used by the `p.*` builders. */
export function createCodec<Out, A extends Arity = "single">(impl: {
  arity?: A;
  element?: AnyCodec;
  enumMembers?: readonly string[];
  kind?: string;
  parseElement: (raw: string) => unknown;
  serializeElement: (value: unknown) => string;
}): Codec<Out, "required", false, A> {
  return build<Out>({
    arity: impl.arity ?? "single",
    catchValue: undefined,
    defaultElides: false,
    defaultValue: undefined,
    element: impl.element,
    enumMembers: impl.enumMembers,
    kind: impl.kind ?? "custom",
    parseElement: impl.parseElement,
    presence: "required",
    serializeElement: impl.serializeElement,
  }) as unknown as Codec<Out, "required", false, A>;
}

function build<Out>(state: CodecState<Out>): Codec<Out> {
  const codec = {
    catch(fallback: (() => Out) | Out) {
      // Runtime guards mirror the type-state for JS consumers.
      if (state.catchValue !== undefined) {
        throw new ParamourError(".catch() may only be applied once");
      }
      return build({ ...state, catchValue: toThunk(fallback, "catch") });
    },
    default(value: (() => Out) | Out) {
      if (state.arity === "many") {
        throw new ParamourError(
          ".default() is not available on array codecs: absent and [] are the same wire state",
        );
      }
      if (state.presence !== "required") {
        throw new ParamourError(
          `.default() is not available after .${state.presence === "optional" ? "optional" : "default"}()`,
        );
      }
      // Value-form defaults are serialized once, here, so a schema-invalid
      // or unserializable default fails at config-definition time — not on
      // every subsequent encode. The wire form is deliberately NOT cached:
      // D8 elision re-serializes the live default per encode, so mutating a
      // reference-typed default can never desync encode from decode the way
      // a stale build-time snapshot would. Factory defaults can't be
      // pre-validated.
      if (!isFactory(value)) {
        serializeDefault(state.serializeElement, value);
      }
      return build({
        ...state,
        defaultElides: !isFactory(value),
        defaultValue: toThunk(value, "default"),
        presence: "defaulted",
      });
    },
    optional() {
      if (state.arity === "many") {
        throw new ParamourError(
          ".optional() is not available on array codecs: absent already decodes to []",
        );
      }
      if (state.presence !== "required") {
        throw new ParamourError(
          `.optional() is not available after .${state.presence === "optional" ? "optional" : "default"}()`,
        );
      }
      return build({ ...state, presence: "optional" });
    },
    "~arity": state.arity,
    "~catchValue": state.catchValue,
    "~caught": state.catchValue !== undefined,
    "~defaultElides": state.defaultElides,
    "~defaultValue": state.defaultValue,
    "~element": state.element,
    "~enumMembers": state.enumMembers,
    "~kind": state.kind,

    "~parseElement": state.parseElement,
    "~presence": state.presence,
    "~serializeElement": state.serializeElement,
  };
  // The cast erases the runtime shape into the type-stated interface; the
  // "~out" phantom is intentionally absent at runtime.
  return codec as unknown as Codec<Out>;
}

/**
 * Factory-vs-value discrimination for `.default()`/`.catch()` arguments.
 * Single source of truth: `.default()`'s elision flag and {@link toThunk}
 * must agree on it for D8 correctness. (An `Out` that is itself a function
 * is indistinguishable from a factory — such values can't serialize anyway.)
 */
function isFactory<Out>(stored: (() => Out) | Out): stored is () => Out {
  return typeof stored === "function";
}

function serializeDefault(
  serializeElement: (value: unknown) => string,
  value: unknown,
): string {
  return rebrandForeign(
    () => serializeElement(value),
    (error) =>
      new ParamourError(".default() value is not serializable by this codec", {
        cause: error,
      }),
  );
}

/**
 * Normalizes a `.default()`/`.catch()` argument to a thunk. Factories are
 * invoked per decode/encode so each call gets a fresh value; the wrapper is
 * the one chokepoint where a throwing user factory is branded ParamourError.
 */
function toThunk<Out>(
  stored: (() => Out) | Out,
  what: "catch" | "default",
): () => Out {
  if (!isFactory(stored)) {
    // Array values are handed out as fresh shallow copies: a consumer
    // mutating a decoded fallback must not pollute later decodes or shift
    // D8 elision (p.csv makes array defaults idiomatic — CV5). Non-array
    // reference values stay by-reference; use a factory to isolate those.
    if (Array.isArray(stored)) return () => stored.slice() as Out;
    return () => stored;
  }
  return () => {
    try {
      return stored();
    } catch (error) {
      // ParseError is data-level by contract (recoverable via .catch()); a
      // factory throwing one is a config-side failure that must not
      // masquerade as a recoverable parse failure — brand it like a foreign
      // throw. Every other ParamourError stays loud as-is.
      if (error instanceof ParamourError && !(error instanceof ParseError)) {
        throw error;
      }
      throw new ParamourError(
        `.${what}() factory threw: ${foreignMessage(error)}`,
        { cause: error },
      );
    }
  };
}
