import type { AnyCodec, OutputOf, ParamCodec } from "./codec.js";

import {
  foreignMessage,
  ParamourError,
  ParamsDecodeError,
  type RouteDecodeError,
  SearchDecodeError,
} from "./errors.js";
import {
  decodeParams,
  type ParamsSource,
  type PathSegment,
  tokenizePath,
} from "./path.js";
import {
  decodeSearch,
  type SearchOutputOf,
  type SearchSlot,
} from "./search.js";

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

/** Decoded params object type for a route (RL3); see {@link ParamsOutput}. */
export type InferRouteParams<R extends AnyRoute> = ParamsOutput<
  R["path"],
  R["~params"]
>;

/** Accepts Next 15/16's promised props and plain objects alike (RL6). */
export type MaybePromise<T> = Promise<T> | T;

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
 * RL9 assigned this to path.ts; it stays here instead so the whole path
 * grammar lives in one module — path.ts consumes it via type-only imports,
 * keeping runtime imports one-directional (route.ts → path.ts).
 */
export type ParamsConfig<Path extends string> = Readonly<
  Record<PathParamNames<Path>, ParamCodec>
>;

/**
 * Parse-output shape (RL3): `[id]` → `Out`, `[...slug]` → `Out[]`,
 * `[[...slug]]` → `Out[]` — every key REQUIRED on the output side; an absent
 * optional catch-all normalizes to `[]` at decode time (D6), so no `?:`
 * split exists here (that split is the href-input side's concern). Keyed by
 * `Path`/`PC` so the Route interface can name its own method return types;
 * {@link InferRouteParams} is the route-object-facing alias.
 */
export type ParamsOutput<Path extends string, PC> = {
  [K in PathParamNames<Path>]: K extends
    CatchAllNames<Path> | OptionalCatchAllNames<Path>
    ? ParamOutput<PC, K>[]
    : ParamOutput<PC, K>;
};

/**
 * Structural props contract for the params half (RL6): layout props are
 * assignable, and a missing member decodes like an empty source
 * (required-missing issues, never a crash). Deliberately NOT Next's
 * generated `PageProps` global — core stays framework-agnostic, and that
 * global doesn't exist in fresh clones before `next dev` first runs.
 */
export interface ParamsProps {
  readonly params?: MaybePromise<ParamsSource>;
}

/** Every dynamic segment name in the path literal (RL3). */
export type PathParamNames<Path extends string> =
  CatchAllNames<Path> | OptionalCatchAllNames<Path> | SingleParamNames<Path>;

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
 * A defined route: data plus the six parse methods (RL1/RL6 — three surfaces
 * × throwing/safe). `~`-prefixed configs are runtime-internal, not public
 * API — same convention as codecs; `@paramour/next` is a blessed consumer,
 * user code is not.
 */
export interface Route<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchSlot,
> {
  /**
   * Decodes both props members. Awaits BOTH up front, then decodes params
   * FIRST — a params grammar failure means the URL doesn't denote this
   * route at all (morally a 404), so it throws before search is decoded.
   */
  parse(props: RouteProps): Promise<{
    params: ParamsOutput<Path, PC>;
    search: SearchOutputOf<SC>;
  }>;
  /** Bare params object (RL6) — layout props are structurally assignable. */
  parseParams(props: ParamsProps): Promise<ParamsOutput<Path, PC>>;
  /** Bare search object (RL6) — the search half alone. */
  parseSearch(props: SearchProps): Promise<SearchOutputOf<SC>>;
  readonly path: Path;
  safeParse(props: RouteProps): Promise<
    SafeResult<{
      params: ParamsOutput<Path, PC>;
      search: SearchOutputOf<SC>;
    }>
  >;
  safeParseParams(
    props: ParamsProps,
  ): Promise<SafeResult<ParamsOutput<Path, PC>>>;
  safeParseSearch(props: SearchProps): Promise<SafeResult<SearchOutputOf<SC>>>;
  readonly "~params": PC;
  readonly "~search": SC;
  /**
   * `path`, tokenized once at define time so per-call encode/decode (href is
   * per-link render work) never re-tokenizes. Per-route state, not a central
   * registry — tree-shaking is untouched.
   */
  readonly "~segments": readonly PathSegment[];
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
  SC extends SearchSlot,
> = [PathParamNames<Path>] extends [never]
  ? { readonly params?: never; readonly search?: SC }
  : { readonly params: ConformParams<Path, PC>; readonly search?: SC };

/** Full page-props contract (RL6): Next's `PageProps` is structurally assignable. */
export interface RouteProps extends ParamsProps, SearchProps {}

/**
 * Status-discriminated result shape (RL6, design-06 PR12 — unified with the
 * pages hooks' `RouterResult`, which extends this union by one `pending`
 * member): `if (result.status === "error")` narrows both arms, and both
 * routers' results destructure identically.
 */
export type SafeResult<T> =
  { data: T; status: "success" } | { error: RouteDecodeError; status: "error" };

/**
 * Structural props contract for the search half (RL6). The wire record
 * shape is the same as the params side's, hence the shared source type.
 */
export interface SearchProps {
  readonly searchParams?: MaybePromise<ParamsSource>;
}

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
  const SC extends SearchSlot = Record<never, never>,
>(path: Path, config: RouteConfig<Path, PC, SC>): Route<Path, PC, SC> {
  // RL1: throws ParamourError on an invalid literal; the segments are kept on
  // the route so the per-call R-rule runtimes never re-tokenize.
  const segments = tokenizePath(path);
  // The conditional RouteConfig is unresolved inside the generic body; this
  // cast is the one place its two branches are unified.
  const { params, search } = config as { params?: PC; search?: SC };
  const route: Route<Path, PC, SC> = {
    async parse(props: RouteProps) {
      const [paramsSource, searchSource] = await awaitProps(props);
      // RL6: params first — a params failure throws before search decodes.
      const decodedParams = decodeParams(route, paramsSource ?? {});
      return {
        params: decodedParams,
        search: decodeSearch(route["~search"], searchSource ?? {}),
      };
    },
    async parseParams(props: ParamsProps) {
      const source = await awaitProp(props.params);
      return decodeParams(route, source ?? {});
    },
    async parseSearch(props: SearchProps) {
      const source = await awaitProp(props.searchParams);
      return decodeSearch(route["~search"], source ?? {});
    },
    path,
    safeParse(props: RouteProps) {
      return safely(() => route.parse(props));
    },
    safeParseParams(props: ParamsProps) {
      return safely(() => route.parseParams(props));
    },
    safeParseSearch(props: SearchProps) {
      return safely(() => route.parseSearch(props));
    },
    "~params": params ?? ({} as PC),
    "~search": search ?? ({} as SC),
    "~segments": segments,
  };
  return route;
}

/** Single-member twin of {@link awaitProps}, for the bare-surface methods. */
function awaitProp(
  value: MaybePromise<ParamsSource> | undefined,
): Promise<ParamsSource | undefined> {
  return rebrandRejection(Promise.resolve(value));
}

/**
 * Awaits BOTH props members before any decode runs (RL6): the
 * params-before-search rule is about *decode* order, not await order —
 * throwing while the searchParams promise is still pending would turn a
 * rejecting props promise into an unhandled rejection.
 */
function awaitProps(
  props: RouteProps,
): Promise<[ParamsSource | undefined, ParamsSource | undefined]> {
  return rebrandRejection(Promise.all([props.params, props.searchParams]));
}

/**
 * A props promise is user/framework code — a rejection is branded at this
 * chokepoint (paramour's own errors pass through), keeping the "every throw
 * is a ParamourError" contract.
 */
async function rebrandRejection<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ParamourError) throw error;
    throw new ParamourError(
      `route props promise rejected: ${foreignMessage(error)}`,
      { cause: error },
    );
  }
}

/**
 * Wraps a throwing parse into the status-discriminated shape (RL6, PR12).
 * Only decode failures become the `error` arm; source-contract violations
 * and rebranded foreign errors stay loud.
 */
async function safely<T>(run: () => Promise<T>): Promise<SafeResult<T>> {
  try {
    return { data: await run(), status: "success" };
  } catch (error) {
    if (
      error instanceof ParamsDecodeError ||
      error instanceof SearchDecodeError
    ) {
      return { error, status: "error" };
    }
    throw error;
  }
}
