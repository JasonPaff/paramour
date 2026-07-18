import type { AnyCodec, Arity, Presence } from "./codec.js";
import type { AnyRoute, RouterKind } from "./route.js";
import type { SearchConfig, SearchSlot } from "./search.js";

/**
 * `.default()` in reflected form. Value-form defaults carry their wire
 * serialization (the same text D8 elision compares against); factory
 * defaults have no stable wire form — invoking one per description would
 * leak time-varying values into what should be static metadata.
 */
export type CodecDefaultDescription =
  | { readonly kind: "factory" }
  | { readonly kind: "value"; readonly wire: string };

/**
 * A codec's reflection surface: everything `paramour list`-style tooling
 * needs to render a config without executing parse/serialize. Optional
 * members are ABSENT (not `undefined`) when they don't apply —
 * exactOptionalPropertyTypes consumers can spread these safely.
 */
export interface CodecDescription {
  readonly arity: Arity;
  readonly caught: boolean;
  readonly defaultValue?: CodecDefaultDescription;
  /**
   * Nested description of a composite list codec's element scalar (CV6;
   * currently `p.csv`).
   */
  readonly element?: CodecDescription;
  readonly enumMembers?: readonly string[];
  readonly kind: string;
  readonly presence: Presence;
}

/** Rendering styles accepted by {@link formatCodecDescription}. */
export type CodecFormatStyle = "compact" | "verbose";

/** A param codec plus the dynamic-segment kind that hosts it. */
export interface ParamDescription extends CodecDescription {
  readonly segmentKind: "catchall" | "optional-catchall" | "single";
}

/** Reflected shape of one defined route. */
export interface RouteDescription {
  readonly params: Readonly<Record<string, ParamDescription>>;
  readonly path: string;
  readonly router: RouterKind;
  readonly search: SearchDescription;
}

/**
 * The `search:` slot's three shapes: absent config, a codec map, or the
 * rawSearch escape hatch (whose schema is a black box — Standard Schema
 * carries no introspectable structure, so `raw` is all there is to say).
 */
export type SearchDescription =
  | {
      readonly keys: Readonly<Record<string, CodecDescription>>;
      readonly kind: "codecs";
    }
  | { readonly kind: "none" }
  | { readonly kind: "raw" };

/**
 * Reflects a codec into plain data. This is the public face of the
 * `~`-prefixed metadata: user code reads descriptions, never the props.
 */
export function describeCodec(codec: AnyCodec): CodecDescription {
  const defaultValue = describeDefault(codec);
  const element = codec["~element"];
  const enumMembers = codec["~enumMembers"];
  return {
    arity: codec["~arity"],
    caught: codec["~caught"],
    ...(defaultValue === undefined ? {} : { defaultValue }),
    // Recursion terminates: nested csv is rejected at construction (CV2),
    // and element codecs are unmodified scalars with no element of their own.
    ...(element === undefined ? {} : { element: describeCodec(element) }),
    ...(enumMembers === undefined ? {} : { enumMembers }),
    kind: codec["~kind"],
    presence: codec["~presence"],
  };
}

/**
 * Reflects a defined route: params in path order (from `~segments`, the
 * define-time token cache), search per {@link SearchDescription}. Accepts
 * both router brands — reflection only needs the data core.
 */
export function describeRoute(route: AnyRoute): RouteDescription {
  const paramsConfig = route["~params"] as Readonly<Record<string, AnyCodec>>;
  const params: Record<string, ParamDescription> = {};
  for (const segment of route["~segments"]) {
    if (segment.kind === "static") continue;
    const codec = paramsConfig[segment.name];
    // Unreachable for routes built by the define constructors (RL1 requires
    // exactly the extracted names); guards hand-assembled objects.
    if (codec === undefined) continue;
    params[segment.name] = {
      ...describeCodec(codec),
      segmentKind: segment.kind,
    };
  }
  return {
    params,
    path: route.path,
    router: route["~router"],
    search: describeSearch(route["~search"] as SearchSlot),
  };
}

/**
 * One-line label for a {@link CodecDescription} — THE shared walk over the
 * description's fields, so every consumer (the devtools panel's shape
 * column, `paramour list`'s annotations) renders the same structure and a
 * future field lands everywhere at once. Two skins over one walk:
 *
 * - `"compact"`: `enum(asc|desc)? =asc catch`, `csv<enum(a|b)>`, `string[]`
 *   — `?` for optional presence, the default's wire form (`=3`) or `=ƒ()`
 *   for a factory default, bare `catch`.
 * - `"verbose"`: `enum(asc, desc) (optional) (default: asc) (catch)` —
 *   parenthesized annotations in fixed order: presence, default, catch.
 */
export function formatCodecDescription(
  description: CodecDescription,
  style: CodecFormatStyle,
): string {
  const memberSeparator = style === "compact" ? "|" : ", ";
  const kindLabel = (
    part: Pick<CodecDescription, "enumMembers" | "kind">,
  ): string =>
    part.enumMembers === undefined
      ? part.kind
      : `enum(${part.enumMembers.join(memberSeparator)})`;
  let label =
    description.element === undefined
      ? kindLabel(description)
      : `${description.kind}<${kindLabel(description.element)}>`;
  if (description.arity === "many") label += "[]";
  if (style === "compact") {
    if (description.presence === "optional") label += "?";
    if (description.defaultValue !== undefined) {
      label +=
        description.defaultValue.kind === "value"
          ? ` =${description.defaultValue.wire}`
          : " =ƒ()";
    }
    if (description.caught) label += " catch";
    return label;
  }
  const notes: string[] = [];
  if (description.presence === "optional") notes.push("(optional)");
  if (description.defaultValue !== undefined) {
    notes.push(
      description.defaultValue.kind === "value"
        ? `(default: ${description.defaultValue.wire})`
        : "(default: factory)",
    );
  }
  if (description.caught) notes.push("(catch)");
  return [label, ...notes].join(" ");
}

/**
 * Value-form defaults re-serialize the live value (the D8 ethos — never a
 * stale snapshot); a throwing serialize here means the default was mutated
 * into invalidity since define time, in which case the description degrades
 * to the factory arm rather than throwing from a read-only reflection call.
 */
function describeDefault(codec: AnyCodec): CodecDefaultDescription | undefined {
  const thunk = codec["~defaultValue"];
  if (thunk === undefined) return undefined;
  if (!codec["~defaultElides"]) return { kind: "factory" };
  try {
    return { kind: "value", wire: codec["~serializeElement"](thunk()) };
  } catch {
    return { kind: "factory" };
  }
}

function describeSearch(slot: SearchSlot): SearchDescription {
  // RawSearch's brand; codec maps never carry top-level `~` keys (SS2).
  if ("~kind" in slot && slot["~kind"] === "raw-search") return { kind: "raw" };
  const entries = Object.entries(slot as SearchConfig);
  if (entries.length === 0) return { kind: "none" };
  const keys: Record<string, CodecDescription> = {};
  for (const [key, codec] of entries) keys[key] = describeCodec(codec);
  return { keys, kind: "codecs" };
}
