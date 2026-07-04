import { ParamourError } from "./errors.js";

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
 * `Out` is the decoded in-memory type. `P`, `C`, and `A` are type-state:
 * modifier methods are conditionally `never`, so illegal chains
 * (`.optional().default()`, double `.catch()`) fail to compile (design-02 D3).
 * Presence modifiers are also `never` for arity-"many" codecs: absent and `[]`
 * are the same wire state (S6/P6), so `.default()`/`.optional()` could never
 * round-trip there.
 *
 * `.default()` and `.catch()` accept either a value or a zero-arg factory;
 * factories are invoked per decode/encode, so reference-typed defaults can be
 * isolated per call (plain object values are returned by reference).
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
> {
  readonly catch: C extends false
    ? (fallback: (() => Out) | Out) => Codec<Out, P, true, A>
    : never;
  readonly default: A extends "single"
    ? P extends "required"
      ? (value: (() => Out) | Out) => Codec<Out, "defaulted", C, A>
      : never
    : never;
  readonly optional: A extends "single"
    ? P extends "required"
      ? () => Codec<Out, "optional", C, A>
      : never
    : never;
  readonly "~arity": A;
  readonly "~catchValue": undefined | { readonly value: (() => Out) | Out };
  readonly "~caught": C;
  readonly "~defaultValue": undefined | { readonly value: (() => Out) | Out };
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
  readonly catchValue: undefined | { readonly value: (() => Out) | Out };
  readonly defaultValue: undefined | { readonly value: (() => Out) | Out };
  readonly parseElement: (raw: string) => unknown;
  readonly presence: Presence;
  readonly serializeElement: (value: unknown) => string;
}

/** Internal factory used by the `p.*` builders. */
export function createCodec<Out, A extends Arity = "single">(impl: {
  arity?: A;
  parseElement: (raw: string) => unknown;
  serializeElement: (value: unknown) => string;
}): Codec<Out, "required", false, A> {
  return build<Out>({
    arity: impl.arity ?? "single",
    catchValue: undefined,
    defaultValue: undefined,
    parseElement: impl.parseElement,
    presence: "required",
    serializeElement: impl.serializeElement,
  }) as unknown as Codec<Out, "required", false, A>;
}

/**
 * Resolves a stored `.default()`/`.catch()` value: factories are invoked per
 * call so each decode gets a fresh value. (An `Out` that is itself a function
 * is indistinguishable from a factory — such values can't serialize anyway.)
 */
export function resolveCodecValue<Out>(stored: (() => Out) | Out): Out {
  return typeof stored === "function" ? (stored as () => Out)() : stored;
}

function build<Out>(state: CodecState<Out>): Codec<Out> {
  const codec = {
    catch(fallback: (() => Out) | Out) {
      // Runtime guards mirror the type-state for JS consumers.
      if (state.catchValue !== undefined) {
        throw new ParamourError(".catch() may only be applied once");
      }
      return build({ ...state, catchValue: { value: fallback } });
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
      return build({
        ...state,
        defaultValue: { value },
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
    "~defaultValue": state.defaultValue,

    "~parseElement": state.parseElement,
    "~presence": state.presence,
    "~serializeElement": state.serializeElement,
  };
  // The cast erases the runtime shape into the type-stated interface; the
  // "~out" phantom is intentionally absent at runtime.
  return codec as unknown as Codec<Out>;
}
