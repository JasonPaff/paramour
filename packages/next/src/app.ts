"use client";

import { useParams, useSearchParams } from "next/navigation";
import {
  type AnyAppRoute,
  decodeParams,
  decodeSearch,
  type InferRouteParams,
  safeDecodeParams,
  safeDecodeSearch,
  type SafeResult,
  type SearchOutputOf,
} from "paramour";

import {
  paramsFingerprint,
  searchParamsFingerprint,
  type SelectOptions,
  useSelectedResult,
  useSelectedValue,
  useStableResult,
} from "./select.js";

export type { SelectOptions } from "./select.js";

/**
 * Client hooks (DESIGN §9, design-07). Each layers over Next's
 * `useSearchParams()` / `useParams()` — App-Router params are synchronous on
 * the client, so there is no loading state, no `useEffect`/`useState`, and
 * the result is SSR-consistent. Two layers per hook (design-07):
 *
 * - Raw-slice stabilization (SEL4): the decode is keyed on the DECLARED
 *   slice of the raw source, not on Next's object reference — a URL change
 *   that only touches keys the route doesn't own (`?utm_source=` churn)
 *   returns the previous result by identity, without re-decoding. Next still
 *   re-renders every subscriber on any URL change (it owns the subscription
 *   — SEL7: selectors stabilize slices, they cannot skip renders); this
 *   layer makes that render cheap and downstream-invisible.
 * - Selection (SEL1–SEL3): every hook takes an optional `{ select }` that
 *   projects the decoded value, with result-equality checking (`Object.is`,
 *   `equality: "shallow"` opt-in) so an unchanged selection keeps its
 *   previous reference when OTHER params change.
 *
 * Both layers are render-phase ref caches (SEL8) — the one sanctioned
 * departure from the pure-`useMemo` discipline these hooks previously held.
 *
 * Two surfaces per half, mirroring core's server `parse` vs `safeParse`:
 * - `useSearch` / `useRouteParams` return the `SafeResult` union
 *   (discriminated on `status`, PR12) — a user editing the URL never crashes
 *   the component. The selector runs on the success arm only (SEL2).
 * - `useSearchOrThrow` / `useRouteParamsOrThrow` throw the decode error in
 *   render, to the nearest client error boundary.
 *
 * Both read the route's blessed-internal `~search` / `~params` via the core
 * decoders (design-03 RL6 — `@paramour/next` is a sanctioned consumer).
 *
 * Every hook is gated to `AnyAppRoute` (design-06 PR3): a pages-branded route
 * at one of these call sites is a compile error, not a runtime surprise —
 * these hooks read Next's App-Router navigation hooks, whose pages twin has
 * different state cardinality (`@paramour-js/next/pages`).
 */

/**
 * Decoded route params as a `SafeResult` (discriminated on `status`, PR12),
 * optionally projected through `options.select` (design-07 SEL1/SEL2).
 *
 * `useParams()` returns `null` outside an App-Router tree — including the
 * initial render of every pages-router page in a hybrid app — so a `null`
 * context degrades to an empty source (`{}`): required params surface as
 * ordinary "missing" decode issues (a `SafeResult` error arm), never a crash.
 * Core keeps its loud throw for genuinely non-object sources from plain-JS
 * callers; the null tolerance lives here at the adapter.
 */
export function useRouteParams<R extends AnyAppRoute>(
  route: R,
): SafeResult<InferRouteParams<R>>;
export function useRouteParams<R extends AnyAppRoute, U>(
  route: R,
  options: SelectOptions<InferRouteParams<R>, U>,
): SafeResult<U>;
export function useRouteParams<R extends AnyAppRoute, U>(
  route: R,
  options?: SelectOptions<InferRouteParams<R>, U>,
): SafeResult<InferRouteParams<R>> | SafeResult<U> {
  const params = useParams() ?? {};
  const result = useStableResult(route, paramsFingerprint(route, params), () =>
    safeDecodeParams(route, params),
  );
  return useSelectedResult(result, options);
}

/**
 * Decoded route params, or a thrown {@link ParamsDecodeError} (→ nearest
 * client error boundary) on a malformed URL. Optionally projected through
 * `options.select` (design-07 SEL1/SEL2).
 *
 * A `null` `useParams()` (outside an App-Router tree, e.g. a hybrid app's
 * pages-router initial render) degrades to `{}` so required params throw the
 * documented {@link ParamsDecodeError}, not an undocumented error class.
 */
export function useRouteParamsOrThrow<R extends AnyAppRoute>(
  route: R,
): InferRouteParams<R>;
export function useRouteParamsOrThrow<R extends AnyAppRoute, U>(
  route: R,
  options: SelectOptions<InferRouteParams<R>, U>,
): U;
export function useRouteParamsOrThrow<R extends AnyAppRoute, U>(
  route: R,
  options?: SelectOptions<InferRouteParams<R>, U>,
): InferRouteParams<R> | U {
  const params = useParams() ?? {};
  const value = useStableResult(route, paramsFingerprint(route, params), () =>
    decodeParams(route, params),
  );
  return useSelectedValue(value, options);
}

/**
 * Decoded search params as a `SafeResult` (discriminated on `status`, PR12),
 * optionally projected through `options.select` (design-07 SEL1/SEL2).
 */
export function useSearch<R extends AnyAppRoute>(
  route: R,
): SafeResult<SearchOutputOf<R["~search"]>>;
export function useSearch<R extends AnyAppRoute, U>(
  route: R,
  options: SelectOptions<SearchOutputOf<R["~search"]>, U>,
): SafeResult<U>;
export function useSearch<R extends AnyAppRoute, U>(
  route: R,
  options?: SelectOptions<SearchOutputOf<R["~search"]>, U>,
): SafeResult<SearchOutputOf<R["~search"]>> | SafeResult<U> {
  const searchParams = useSearchParams();
  const result = useStableResult(
    route,
    searchParamsFingerprint(route, searchParams),
    () => safeDecodeSearch(route, searchParams),
  );
  return useSelectedResult(result, options);
}

/**
 * Decoded search params, or a thrown {@link SearchDecodeError} (→ nearest
 * client error boundary) on a malformed URL. Optionally projected through
 * `options.select` (design-07 SEL1/SEL2).
 */
export function useSearchOrThrow<R extends AnyAppRoute>(
  route: R,
): SearchOutputOf<R["~search"]>;
export function useSearchOrThrow<R extends AnyAppRoute, U>(
  route: R,
  options: SelectOptions<SearchOutputOf<R["~search"]>, U>,
): U;
export function useSearchOrThrow<R extends AnyAppRoute, U>(
  route: R,
  options?: SelectOptions<SearchOutputOf<R["~search"]>, U>,
): SearchOutputOf<R["~search"]> | U {
  const searchParams = useSearchParams();
  const value = useStableResult(
    route,
    searchParamsFingerprint(route, searchParams),
    // decodeSearch is keyed on SearchOutputOf (design-04 SS6) — the correct
    // public type — but AnyAppRoute erases its SC to `any`, so for a still-
    // generic R the call's SearchOutputOf<R["~search"]> reduces to `unknown`
    // on the value side while staying deferred on the annotation side. The
    // cast bridges that inference gap to the SAME (correct) type, so a
    // rawSearch route now infers its schema output here, not a garbage
    // {~kind, ~schema} shape.
    () =>
      decodeSearch(route["~search"], searchParams) as SearchOutputOf<
        R["~search"]
      >,
  );
  return useSelectedValue(value, options);
}
