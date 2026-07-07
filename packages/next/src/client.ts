"use client";

import { useParams, useSearchParams } from "next/navigation";
import {
  type AnyRoute,
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
 * - `useSearch` / `useRouteParams` return the `SafeResult` union (`data` xor
 *   `error`) — a user editing the URL never crashes the component.
 * - `useSearchOrThrow` / `useRouteParamsOrThrow` throw the decode error in
 *   render, to the nearest client error boundary.
 *
 * Both read the route's blessed-internal `~search` / `~params` via the core
 * decoders (design-03 RL6 — `@paramour/next` is a sanctioned consumer).
 */

/** Decoded route params as a `SafeResult` (`{ data } | { error }`). */
export function useRouteParams<R extends AnyRoute>(
  route: R,
): SafeResult<InferRouteParams<R>> {
  const params = useParams();
  return useMemo(() => safeDecodeParams(route, params), [route, params]);
}

/**
 * Decoded route params, or a thrown {@link ParamsDecodeError} (→ nearest
 * client error boundary) on a malformed URL.
 */
export function useRouteParamsOrThrow<R extends AnyRoute>(
  route: R,
): InferRouteParams<R> {
  const params = useParams();
  return useMemo(() => decodeParams(route, params), [route, params]);
}

/** Decoded search params as a `SafeResult` (`{ data } | { error }`). */
export function useSearch<R extends AnyRoute>(
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
export function useSearchOrThrow<R extends AnyRoute>(
  route: R,
): SearchOutputOf<R["~search"]> {
  const searchParams = useSearchParams();
  return useMemo(
    // decodeSearch is keyed on SearchOutputOf (design-04 SS6) — the correct
    // public type — but AnyRoute erases its SC to `any`, so for a still-
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
