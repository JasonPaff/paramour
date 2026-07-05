import type { AnyRoute } from "./route.js";

import { buildPath, type InferParamsInput } from "./path.js";
import {
  buildSearchString,
  encodeSearch,
  type InferSearchInput,
  type SearchConfig,
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
  PartFor<"search", InferSearchInput<R["~search"]>> & { hash?: string };

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
 */
export function href<R extends AnyRoute>(
  route: R,
  ...args: HrefArgs<R>
): Href<R["path"]> {
  // The conditional tuple is unresolved inside the generic body; this
  // structural cast unifies its branches (same move as defineRoute's config
  // cast). Not InferHrefInput<AnyRoute>: for AnyRoute both halves are
  // empty-input, which PartFor now types `?: never`.
  const [options] = args as [
    { hash?: string; params?: unknown; search?: unknown }?,
  ];
  const path = buildPath(route, (options?.params ?? {}) as InferParamsInput<R>);
  const query = buildSearchString(
    encodeSearch(
      route["~search"] as SearchConfig,
      (options?.search ?? {}) as InferSearchInput<SearchConfig>,
    ),
  );
  // S10: the fragment is appended VERBATIM — no encoding, the caller owns
  // escaping (a value already starting with "#" yields "##…"). The empty
  // string emits no "#".
  const hash = options?.hash;
  const fragment = hash === undefined || hash === "" ? "" : `#${hash}`;
  return `${path}${query}${fragment}` as Href<R["path"]>;
}
