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
import { useMemo } from "react";

/**
 * Client hooks (DESIGN §9). Each is a `useMemo` over Next's `useSearchParams()`
 * / `useParams()` — App-Router params are synchronous on the client, so there
 * is no loading state, no `useEffect`/`useState`, and the result is SSR-
 * consistent and React-Compiler-friendly. The memo is keyed on the Next hook's
 * return value: Next hands back a referentially-stable value per URL, and a
 * re-decode on the rare fresh reference is cheap and pure.
 *
 * Two surfaces per half, mirroring core's server `parse` vs `safeParse`:
 * - `useSearch` / `useRouteParams` return the `SafeResult` union
 *   (discriminated on `status`, PR12) — a user editing the URL never crashes
 *   the component.
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
 * Decoded route params as a `SafeResult` (discriminated on `status`, PR12).
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
): SafeResult<InferRouteParams<R>> {
  const params = useParams() ?? {};
  return useMemo(() => safeDecodeParams(route, params), [route, params]);
}

/**
 * Decoded route params, or a thrown {@link ParamsDecodeError} (→ nearest
 * client error boundary) on a malformed URL.
 *
 * A `null` `useParams()` (outside an App-Router tree, e.g. a hybrid app's
 * pages-router initial render) degrades to `{}` so required params throw the
 * documented {@link ParamsDecodeError}, not an undocumented error class.
 */
export function useRouteParamsOrThrow<R extends AnyAppRoute>(
  route: R,
): InferRouteParams<R> {
  const params = useParams() ?? {};
  return useMemo(() => decodeParams(route, params), [route, params]);
}

/** Decoded search params as a `SafeResult` (discriminated on `status`, PR12). */
export function useSearch<R extends AnyAppRoute>(
  route: R,
): SafeResult<SearchOutputOf<R["~search"]>> {
  const searchParams = useSearchParams();
  return useMemo(
    () => safeDecodeSearch(route, searchParams),
    [route, searchParams],
  );
}

/**
 * Decoded search params, or a thrown {@link SearchDecodeError} (→ nearest
 * client error boundary) on a malformed URL.
 */
export function useSearchOrThrow<R extends AnyAppRoute>(
  route: R,
): SearchOutputOf<R["~search"]> {
  const searchParams = useSearchParams();
  return useMemo(
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
    [route, searchParams],
  );
}
