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
 * reach contravariant positions through the parse methods and `HrefArgs`;
 * the `unknown` form would reject every concrete route.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAppRoute = AppRoute<string, any, any>;

/** Pages twin of {@link AnyAppRoute} (PR3). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPagesRoute = PagesRoute<string, any, any>;

/**
 * Router-agnostic (PR3): matches both brands. This is the bound for
 * everything that only needs the data core — `href()`, the standalone
 * decoders, `InferRouteParams` — none of which differ by router.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRoute = Route<string, any, any>;

/**
 * An App Router route (PR3/PR7): the async props-based parse surface —
 * three surfaces × throwing/safe (RL1/RL6). Props may be promised (Next
 * 15/16) and are awaited before any decode runs.
 */
export interface AppRoute<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchSlot,
> extends Route<Path, PC, SC, "app"> {
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
}

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
 * Structural context contract for the pages parse surface (PR10): the shape
 * `getServerSideProps` and `getInitialProps` contexts share, with no
 * `next/*` import (the ParamsProps/SearchProps precedent). `query` is
 * REQUIRED: `GetStaticPropsContext` has no query string, so it fails to
 * compose here by design — typed search at build time would be a lie; the
 * static story is core's `decodeParams`/`safeDecodeParams`. Both
 * assignability claims are pinned per supported Next major in
 * `examples/next-compat/src/contexts.ts` (PR13).
 */
export interface PagesContext {
  readonly params?: ParamsSource | undefined;
  readonly query: ParamsSource;
}

/**
 * A Pages Router route (PR3/PR10): the sync context-based parse surface.
 * `getServerSideProps` / `getInitialProps` hand params and query
 * synchronously and pre-merged, so there is no promised-props machinery
 * here — the context split (params authoritative, query minus path-param
 * names as search) is the whole job.
 */
export interface PagesRoute<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchSlot,
> extends Route<Path, PC, SC, "pages"> {
  /**
   * Decodes both context halves, params FIRST (same morally-a-404 rule as
   * the app surface). `ctx.params` is authoritative for path params when
   * present; when absent (`getInitialProps` — `NextPageContext` has no
   * `params` even on dynamic routes) they are extracted from `query` by
   * segment name, which is sound because Next's own merge gives route
   * params precedence in `query` (PR10).
   */
  parseContext(context: PagesContext): {
    params: ParamsOutput<Path, PC>;
    search: SearchOutputOf<SC>;
  };
  /** {@link parseContext} in the safe shape — `safely`'s taxonomy (PR12). */
  safeParseContext(context: PagesContext): SafeResult<{
    params: ParamsOutput<Path, PC>;
    search: SearchOutputOf<SC>;
  }>;
}

/**
 * Augmented by codegen with per-router path unions (RL8/PR9):
 * `{ appRoutes: "/a" | …; pagesRoutes: "/x" | … }`. Each member is
 * independently ABSENT when its scan is empty (TR3's absent-not-`never`
 * rule), preserving per-router world-A/B independence. The generated
 * artifact is a pure `.d.ts` module augmentation — no runtime import, so
 * tree-shaking is untouched (spike-01 lock-ins #3/#4).
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
 * `Path`/`PC` so the route interfaces can name their own method return
 * types; {@link InferRouteParams} is the route-object-facing alias.
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
 * Pre-generation: ParamourRegister has no `appRoutes` member, so this
 * resolves to `string` and any path literal is accepted (unverified).
 * Post-generation it resolves to the union of filesystem-verified app-router
 * paths (RL8, spike-01). Per-router on purpose (PR9): an empty app scan
 * keeps THIS fallback while `pagesRoutes` narrows, and vice versa.
 */
export type RegisteredAppRoutePaths = ParamourRegister extends {
  appRoutes: infer R extends string;
}
  ? R
  : string;

/** Pages twin of {@link RegisteredAppRoutePaths} (PR9). */
export type RegisteredPagesRoutePaths = ParamourRegister extends {
  pagesRoutes: infer R extends string;
}
  ? R
  : string;

/**
 * The router-agnostic core of a defined route (PR3): path, configs, and the
 * define-time token cache. The parse surface is router-specific and lives on
 * {@link AppRoute} / {@link PagesRoute} — gating it via the interface split
 * makes the wrong surface ABSENT, not just ill-typed. `~`-prefixed members
 * are runtime-internal, not public API — same convention as codecs;
 * `@paramour/next` is a blessed consumer, user code is not.
 */
export interface Route<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchSlot,
  R extends RouterKind = RouterKind,
> {
  readonly path: Path;
  readonly "~params": PC;
  /** The router brand (PR3) — type-state, same discipline as Codec's P/C/A. */
  readonly "~router": R;
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

/** Which router a route belongs to (PR3) — the value of the `~router` brand. */
export type RouterKind = "app" | "pages";

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
 * Defines an App Router route: the URL-shaped path literal (RL2) plus its
 * param/search codec configs. Validates the literal eagerly (RL1 —
 * fail-fast at config definition time, same stance as eager `.default()`
 * serialization). The router is a *declaration*, not an inference (PR7):
 * pre-codegen the registry cannot distinguish routers, so an inferred brand
 * would silently degrade in world A — the split constructor is what keeps
 * the brand intact there.
 */
export function defineAppRoute<
  // Pre-generation RegisteredAppRoutePaths resolves to `string`, making the
  // intersection look redundant — but the RL1 signature is pinned; the
  // `& string` half is what template-literal inference and Route's own
  // constraint see regardless of what codegen merges into the registry.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
  Path extends RegisteredAppRoutePaths & string,
  const PC extends ParamsConfig<Path> = ParamsConfig<Path>,
  const SC extends SearchSlot = Record<never, never>,
>(path: Path, config: RouteConfig<Path, PC, SC>): AppRoute<Path, PC, SC> {
  const route: AppRoute<Path, PC, SC> = {
    ...routeData("app", path, config),
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
    safeParse(props: RouteProps) {
      return safely(() => route.parse(props));
    },
    safeParseParams(props: ParamsProps) {
      return safely(() => route.parseParams(props));
    },
    safeParseSearch(props: SearchProps) {
      return safely(() => route.parseSearch(props));
    },
  };
  return route;
}

/**
 * Defines a Pages Router route (PR7 — neither router is the default; see
 * {@link defineAppRoute} for why the constructor is split rather than
 * inferred). Same eager literal validation (RL1); the parse surface is the
 * sync context pair (PR10).
 */
export function definePagesRoute<
  // Same pinned-signature rationale as defineAppRoute's intersection.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
  Path extends RegisteredPagesRoutePaths & string,
  const PC extends ParamsConfig<Path> = ParamsConfig<Path>,
  // PR9: search ∩ params disjointness. `router.query` merges the two halves
  // with route params winning, so a pages search key shadowing a path param
  // could never receive a value — it fails to compile here instead. App
  // routes carry no such constraint: their two sources are separate, so
  // `?id=` on `/product/[id]` is well-defined there.
  const SC extends Readonly<Partial<Record<PathParamNames<Path>, never>>> &
    SearchSlot = Record<never, never>,
>(path: Path, config: RouteConfig<Path, PC, SC>): PagesRoute<Path, PC, SC> {
  const data = routeData("pages", path, config);
  // PR10: the query→params extraction and query→search subtraction both key
  // on the dynamic-segment names; computed once at define time (the
  // ~segments ethos — per-call parses never re-derive them).
  const paramNames = new Set<string>();
  for (const segment of data["~segments"]) {
    if (segment.kind !== "static") paramNames.add(segment.name);
  }
  const route: PagesRoute<Path, PC, SC> = {
    ...data,
    parseContext(context: PagesContext) {
      const [paramsSource, searchSource] = splitPagesContext(
        context,
        paramNames,
      );
      // PR10: params first — same morally-a-404 rule as the app surface.
      const decodedParams = decodeParams(route, paramsSource);
      return {
        params: decodedParams,
        search: decodeSearch(route["~search"], searchSource),
      };
    },
    safeParseContext(context: PagesContext) {
      // safely's taxonomy (PR12), minus the await: only decode failures
      // become the error arm; contract violations stay loud.
      try {
        return { data: route.parseContext(context), status: "success" };
      } catch (error) {
        if (
          error instanceof ParamsDecodeError ||
          error instanceof SearchDecodeError
        ) {
          return { error, status: "error" };
        }
        throw error;
      }
    },
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
 * Own enumerable properties of `source` whose keys are NOT in `keys` —
 * the query→search subtraction (PR10). Entries → fromEntries so keys like
 * "__proto__" stay ordinary own properties (decodeParams's ethos).
 */
function omitOwn(
  source: ParamsSource,
  keys: ReadonlySet<string>,
): ParamsSource {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !keys.has(key)),
  );
}

/**
 * Own properties of `source` at exactly `keys` — the query→params
 * extraction (PR10). A name missing from the source is simply omitted, so
 * it surfaces downstream as decodeParams's ordinary required-missing issue,
 * never a crash here.
 */
function pickOwn(
  source: ParamsSource,
  keys: ReadonlySet<string>,
): ParamsSource {
  const entries: [string, string | string[] | undefined][] = [];
  for (const key of keys) {
    if (Object.hasOwn(source, key)) entries.push([key, source[key]]);
  }
  return Object.fromEntries(entries);
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
 * Shared define-time core of both constructors (PR7): validates the literal
 * eagerly (RL1 — throws ParamourError on an invalid literal) and pins the
 * data members both parse surfaces build on. The conditional RouteConfig is
 * unresolved inside a generic body; the cast here is the one place its two
 * branches are unified.
 */
function routeData<
  Path extends string,
  PC extends ParamsConfig<Path>,
  SC extends SearchSlot,
  R extends RouterKind,
>(
  router: R,
  path: Path,
  config: RouteConfig<Path, PC, SC>,
): Route<Path, PC, SC, R> {
  const segments = tokenizePath(path);
  const { params, search } = config as { params?: PC; search?: SC };
  return {
    path,
    "~params": params ?? ({} as PC),
    "~router": router,
    "~search": search ?? ({} as SC),
    "~segments": segments,
  };
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

/**
 * Splits a pages context into its params/search decode sources (PR10).
 * `params` is authoritative when present — handed to decodeParams whole,
 * whose own contract check rejects a garbage member; absent, path params
 * are extracted from `query` by name. Search is always `query` minus the
 * path-param names. A missing `query` is a CONTRACT violation, not a decode
 * issue: `getStaticProps` has no query string, so composing its context
 * here would be a lie (PR10) — the error names the supported path instead.
 */
function splitPagesContext(
  context: PagesContext,
  paramNames: ReadonlySet<string>,
): [ParamsSource, ParamsSource] {
  const untrusted: unknown = context;
  if (typeof untrusted !== "object" || untrusted === null) {
    throw new ParamourError(
      `pages context must be an object, got ${untrusted === null ? "null" : typeof untrusted}`,
    );
  }
  const { params, query } = untrusted as PagesContext;
  const untrustedQuery: unknown = query;
  if (typeof untrustedQuery !== "object" || untrustedQuery === null) {
    throw new ParamourError(
      `pages context has no query object (got ${untrustedQuery === null ? "null" : typeof untrustedQuery}): getStaticProps contexts carry no query string — decode ctx.params with safeDecodeParams instead (PR10)`,
    );
  }
  return [params ?? pickOwn(query, paramNames), omitOwn(query, paramNames)];
}
