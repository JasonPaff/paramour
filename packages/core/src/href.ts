import type {
  AnyRoute,
  ParamsConfig,
  RegisteredStaticRoutePaths,
  Route,
} from "./route.js";

import { ParamourError } from "./errors.js";
import { buildPath, type InferParamsInput } from "./path.js";
import {
  type SearchInputOf,
  type SearchSlot,
  searchToString,
} from "./search.js";

/**
 * Type-only brand carrier (RL4): no runtime value ever exists — the brand
 * is applied by a compile-time cast, so Href costs nothing at runtime.
 */
declare const HREF: unique symbol;

/**
 * A paramour-built link (RL4). Assignable TO `string`, so `next/link`,
 * `router.push`, `redirect`, `generateMetadata` consume it unchanged
 * (DESIGN principle 5); not assignable FROM `string`, which is the enabling
 * substrate for the v1.x "accept only paramour-built links" narrowing APIs
 * (RL10.6). Removing the brand later would be breaking; RL4 commits to it.
 */
export type Href<P extends string = string> = string & { [HREF]: P };

/**
 * href's variadic options tuple (RL4): the entire argument is omittable
 * when neither half has a required member — `href(aboutRoute)`.
 */
export type HrefArgs<R extends AnyRoute> =
  Record<never, never> extends InferHrefInput<R>
    ? [options?: InferHrefInput<R>]
    : [options: InferHrefInput<R>];

/**
 * href's options object (RL4): `{ params, search?, hash? }`. Property
 * optionality is presence-driven on BOTH halves (maintainer ruling,
 * 2026-07-04, amending RL4's letter): a half may be omitted when its input
 * type has no required key — for `params` that means static routes and
 * routes whose only dynamic segment is an optional catch-all; for `search`
 * it is design-02 D4's rule surfacing at the property level. A half whose
 * input has no keys AT ALL may not be passed even empty (see PartFor).
 * `hash` implements S10 — fragments come only from an explicit caller
 * option.
 */
export type InferHrefInput<R extends AnyRoute> = PartFor<
  "params",
  InferParamsInput<R>
> &
  PartFor<"search", SearchInputOf<R["~search"]>> & { hash?: string };

/**
 * The string form's options (SH4): hash only. `params` is meaningless on a
 * static path, and a query string comes only from a defined route's search
 * codecs — a raw-search escape hatch here would be an untyped side door
 * around library-owned serialization. Both are banned outright (`?: never`,
 * the 2026-07-04 ruling's move) rather than merely omitted, so a non-fresh
 * options object can't smuggle them past excess-property checking.
 */
export interface StaticHrefOptions {
  hash?: string;
  params?: never;
  search?: never;
}

/**
 * One options property whose presence follows its input type: required iff
 * the input has at least one required key (the design-02 D4
 * `object extends` probe). An input with NO keys at all bans the property
 * outright (`?: never`, maintainer ruling 2026-07-04 amending RL4) — the
 * bare `Partial<Record<Key, Input>>` form would accept arbitrary junk
 * there, because the empty object type is exempt from excess-property
 * checking; `?: never` mirrors RouteConfig's static-path `params?: never`.
 */
type PartFor<Key extends string, Input> = keyof Input extends never
  ? Partial<Record<Key, never>>
  : Record<never, never> extends Input
    ? Partial<Record<Key, Input>>
    : Record<Key, Input>;

/**
 * Builds a link for a route: fixed path–`?query`–`#hash` assembly (RL4). A
 * standalone function, not a route method (DESIGN §4/§8): parse sites sit
 * next to one route, href sites import `{ href }` once and use it against
 * many routes. Serialization failures are `SerializeError` at link-build
 * time (RL5's R-rules); config-contract violations from hand-built routes
 * (a missing param codec or `~search` config) are base `ParamourError` — a
 * JS caller omitting a required `search` half falls through to
 * encodeSearch's own required-missing error.
 *
 * The string form (SH1): a registered STATIC path stands in for the route
 * object — same brand, same hash assembly, no route definition needed. The
 * string overload sits first so the route-object overload is last (SH8):
 * TS's "the last overload gave the following error" heuristic keeps
 * route-object misuse diagnostics prominent.
 */
export function href<P extends RegisteredStaticRoutePaths>(
  path: P,
  options?: StaticHrefOptions,
): Href<P>;
export function href<R extends AnyRoute>(
  route: R,
  ...args: HrefArgs<R>
): Href<R["path"]>;
// The conditional HrefArgs tuple is unresolvable inside a generic body, so
// the unsoundness lives at this one overload boundary (same move as
// routeData's config cast) instead of per-expression casts: the
// implementation sees each option half at its loosest honest type.
export function href(
  route: Route<string, ParamsConfig<string>, SearchSlot> | string,
  options?: {
    hash?: string;
    params?: InferParamsInput<AnyRoute>;
    search?: SearchInputOf<SearchSlot>;
  },
): string {
  // S10: the fragment is appended VERBATIM — no encoding, the caller owns
  // escaping (a value already starting with "#" yields "##…"). The empty
  // string emits no "#".
  const hash = options?.hash;
  const fragment = hash === undefined || hash === "" ? "" : `#${hash}`;
  if (typeof route === "string") {
    // SH6: fail-fast backstop for JS callers and world-A typos of the
    // dynamic-path variety — a bracket means "you need a route object", and
    // query/hash never ride in the path string (query comes only from
    // search codecs, hash only from the option).
    if (!route.startsWith("/") || /[#?[\]]/.test(route)) {
      throw new ParamourError(
        `href(path) requires a static route path, got ${JSON.stringify(route)}: dynamic segments need a route object, and query/hash never ride in the path string`,
      );
    }
    // SH6: silently dropping a half a JS caller passed would build a wrong
    // link — contract violations stay loud (never the safe-parse error arm).
    if (options?.params !== undefined || options?.search !== undefined) {
      throw new ParamourError(
        `href(path) takes no params/search — a static path has no params, and a query string needs a route with search codecs`,
      );
    }
    return `${route}${fragment}`;
  }
  const path = buildPath(route, options?.params ?? {});
  const query = searchToString(route["~search"], options?.search ?? {});
  return `${path}${query}${fragment}`;
}
