import type { AnyCodec, OutputOf, ParamCodec } from "./codec.js";
import type { SearchConfig } from "./search.js";

import { ParamourError } from "./errors.js";

/**
 * `any` is deliberate (RL4, same variance gotcha as AnyCodec): codec configs
 * reach contravariant positions through the parse methods and `HrefArgs` in
 * later milestones; the `unknown` form would reject every concrete route.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRoute = Route<string, any, any>;

/** Names of `[...name]` catch-all segments in the path literal (RL3). */
export type CatchAllNames<Path extends string> =
  Segments<Path> extends infer S extends string
    ? S extends `[...${infer Name}]`
      ? NonEmptyName<Name>
      : never
    : never;

/**
 * Exact-key enforcement (RL1): every excess key's value type becomes `never`,
 * so a misspelled param fails to compile on its own property line while `PC`
 * itself stays the naked inference site for `const` codec-literal retention.
 */
export type ConformParams<Path extends string, PC> = PC &
  Record<Exclude<keyof PC, PathParamNames<Path>>, never>;

/**
 * Parse-output shape (RL3): `[id]` → `Out`, `[...slug]` → `Out[]`,
 * `[[...path]]` → `Out[]` — every key REQUIRED on the output side; an absent
 * optional catch-all normalizes to `[]` at decode time (D6), so no `?:`
 * split exists here (that split is the href-input side's concern).
 */
export type InferRouteParams<R extends AnyRoute> = {
  [K in PathParamNames<R["path"]>]: K extends
    CatchAllNames<R["path"]> | OptionalCatchAllNames<R["path"]>
    ? ParamOutput<R["~params"], K>[]
    : ParamOutput<R["~params"], K>;
};

/**
 * RL3: an empty name (`[]`, `[...]`, `[[...]]`) is not a token — it falls
 * through as static text; the runtime malformed-bracket check is the backstop.
 */
export type NonEmptyName<Name extends string> = Name extends "" ? never : Name;

/**
 * Names of `[[...name]]` optional catch-all segments (RL3). The `infer S`
 * indirection is load-bearing: conditionals distribute only over naked type
 * parameters, and `Segments<Path>` is an alias application, not a parameter.
 */
export type OptionalCatchAllNames<Path extends string> =
  Segments<Path> extends infer S extends string
    ? S extends `[[...${infer Name}]]`
      ? NonEmptyName<Name>
      : never
    : never;

/**
 * Augmented by codegen with `{ routes: "/a" | "/b" | ... }` (RL8). The
 * generated artifact is a pure `.d.ts` module augmentation — no runtime
 * import, so tree-shaking is untouched (spike-01 lock-ins #3/#4).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ParamourRegister {}

/** The decoded output type of the codec at key `K`, if one is declared. */
export type ParamOutput<PC, K extends PropertyKey> = K extends keyof PC
  ? PC[K] extends AnyCodec
    ? OutputOf<PC[K]>
    : never
  : never;

/**
 * Params schema shape for a path: one codec per dynamic segment name. The
 * codec describes ONE segment element (design-02 D5/D6) — arrays come from
 * the segment kind, and presence modifiers are compile errors (`ParamCodec`).
 * RL9 assigns this to path.ts; it lives here until that module lands.
 */
export type ParamsConfig<Path extends string> = Readonly<
  Record<PathParamNames<Path>, ParamCodec>
>;

/** Every dynamic segment name in the path literal (RL3). */
export type PathParamNames<Path extends string> =
  CatchAllNames<Path> | OptionalCatchAllNames<Path> | SingleParamNames<Path>;

/** One parsed path segment. Consumed by defineRoute now, path.ts (RL5) later. */
export type PathSegment =
  | {
      readonly kind: "catchall" | "optional-catchall" | "single";
      readonly name: string;
      readonly raw: string;
    }
  | { readonly kind: "static"; readonly raw: string };

/**
 * Pre-generation: ParamourRegister has no `routes` member, so this resolves
 * to `string` and any path literal is accepted (unverified). Post-generation
 * it resolves to the union of filesystem-verified paths (RL8, spike-01).
 */
export type RegisteredRoutePaths = ParamourRegister extends {
  routes: infer R extends string;
}
  ? R
  : string;

/**
 * A defined route: data plus (in later milestones) parse methods (RL1).
 * `~`-prefixed configs are runtime-internal, not public API — same
 * convention as codecs; `@paramour/next` is a blessed consumer, user code
 * is not.
 */
export interface Route<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchConfig,
> {
  readonly path: Path;
  readonly "~params": PC;
  readonly "~search": SC;
}

/**
 * Conditional on the path shape (RL1, spike-01 lock-in #2): dynamic paths
 * REQUIRE `params` with exactly the extracted segment names; static paths
 * REJECT it (`?: never` — may be absent, may never be present, which under
 * exactOptionalPropertyTypes holds even for non-fresh objects).
 */
export type RouteConfig<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchConfig,
> = [PathParamNames<Path>] extends [never]
  ? { readonly params?: never; readonly search?: SC }
  : { readonly params: ConformParams<Path, PC>; readonly search?: SC };

/**
 * Distributes a path literal into the union of its `/`-separated segment
 * literals. Malformed bracket tokens fall through as static text — no
 * type-level path linting (RL3); tokenizePath is the runtime backstop.
 */
export type Segments<S extends string> = S extends `${infer Head}/${infer Rest}`
  ? Segments<Head> | Segments<Rest>
  : S;

/**
 * Names of single `[name]` segments (RL3). Conditional order is load-bearing
 * and mirrors tokenizePath: both catch-all forms must be excluded first or
 * `[...slug]` would extract as a single param named `"...slug"`.
 */
export type SingleParamNames<Path extends string> =
  Segments<Path> extends infer S extends string
    ? S extends `[[...${string}]]`
      ? never
      : S extends `[...${string}]`
        ? never
        : S extends `[${infer Name}]`
          ? NonEmptyName<Name>
          : never
    : never;

// Anchored per the wire-format spec's regex ethos; name charset excludes
// brackets so nesting can't smuggle through. Match order mirrors the type
// grammar: `[[...` before `[...` before `[`.
const OPTIONAL_CATCHALL_TOKEN = /^\[\[\.\.\.([^\][]+)\]\]$/;
const CATCHALL_TOKEN = /^\[\.\.\.([^\][]+)\]$/;
const SINGLE_TOKEN = /^\[([^\][]+)\]$/;
const GROUP_SEGMENT = /^\(.*\)$/;

/**
 * Defines a route: the URL-shaped path literal (RL2) plus its param/search
 * codec configs. Validates the literal eagerly (RL1 — fail-fast at config
 * definition time, same stance as eager `.default()` serialization).
 */
export function defineRoute<
  // Pre-generation RegisteredRoutePaths resolves to `string`, making the
  // intersection look redundant — but the RL1 signature is pinned; the
  // `& string` half is what template-literal inference and Route's own
  // constraint see regardless of what codegen merges into the registry.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
  Path extends RegisteredRoutePaths & string,
  const PC extends ParamsConfig<Path> = ParamsConfig<Path>,
  const SC extends SearchConfig = Record<never, never>,
>(path: Path, config: RouteConfig<Path, PC, SC>): Route<Path, PC, SC> {
  tokenizePath(path); // RL1: throws ParamourError on an invalid literal
  // The conditional RouteConfig is unresolved inside the generic body; this
  // cast is the one place its two branches are unified.
  const { params, search } = config as { params?: PC; search?: SC };
  return {
    path,
    "~params": params ?? ({} as PC),
    "~search": search ?? ({} as SC),
  };
}

/**
 * Tokenizes a path literal into segments, throwing ParamourError on every
 * RL1 rejection. Shared by defineRoute now and path.ts (RL5) later, so
 * encode/decode never re-derive segment kinds.
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
