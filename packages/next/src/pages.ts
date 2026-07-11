import { useRouter } from "next/router";
import {
  type AnyPagesRoute,
  type InferRouteParams,
  ParamourError,
  type ParamsSource,
  safeDecodeParams,
  safeDecodeSearch,
  type SafeResult,
  type SearchOutputOf,
} from "paramour";

import {
  paramsFingerprint,
  PENDING_FINGERPRINT,
  queryFingerprint,
  type SelectOptions,
  useSelectedResult,
  useStableResult,
} from "./select.js";

export type { SelectOptions } from "./select.js";

/**
 * Pages Router hooks (design-06 PR5/PR6, design-07). Deliberately NO
 * `"use client"` directive on this module: the directive is an App Router
 * (RSC graph) concept, meaningless in a `pages/` bundle (PR2).
 *
 * `useRouter().query` is one merged bag (route params + search), and on a
 * statically-optimized page it is `{}` until `router.isReady` flips after
 * hydration — a platform fact the result type admits as a third state
 * instead of papering over (PR5). On `getServerSideProps` pages the FIRST
 * render is already `isReady: true` with a populated query (design-06
 * spike 3), so the `pending` arm never surfaces there.
 *
 * Deliberately NO `OrThrow` variants (PR6): throwing on `pending` would
 * flash the error boundary on every statically-optimized page's first
 * render, and returning `T | undefined` would make the name a lie. The
 * three-state union forcing the check IS the feature — and users who know
 * their page has `getServerSideProps` should be reading typed props from
 * `route.parseContext(ctx)` (PR10) rather than reaching for a client hook.
 *
 * Both hooks are gated to `AnyPagesRoute` (PR3) and share the /app hooks'
 * design-07 layering: raw-slice stabilization keyed on the declared slice of
 * `query` (+ `isReady`), then an optional `{ select }` projection with
 * result-equality checking — the `pending` arm passes through the selector
 * untouched (SEL2), and `PENDING` itself is one referentially stable object.
 */

/**
 * Three-state result for the pages hooks (PR5): core's `SafeResult` plus a
 * `pending` member for the pre-`isReady` render of a statically-optimized
 * page. Literally `SafeResult<T> | { status: "pending" }` (PR12), so both
 * routers' results destructure identically.
 */
export type RouterResult<T> = SafeResult<T> | { status: "pending" };

/** Referentially stable across every pending render. */
const PENDING: { readonly status: "pending" } = { status: "pending" };

/**
 * Decoded route params as a {@link RouterResult} (PR5), optionally projected
 * through `options.select` (design-07 SEL1/SEL2).
 */
export function useRouteParams<R extends AnyPagesRoute>(
  route: R,
): RouterResult<InferRouteParams<R>>;
export function useRouteParams<R extends AnyPagesRoute, U>(
  route: R,
  options: SelectOptions<InferRouteParams<R>, U>,
): RouterResult<U>;
export function useRouteParams<R extends AnyPagesRoute, U>(
  route: R,
  options?: SelectOptions<InferRouteParams<R>, U>,
): RouterResult<InferRouteParams<R>> | RouterResult<U> {
  const { isReady, query } = usePagesRouter();
  const result = useStableResult(
    route,
    isReady ? paramsFingerprint(route, query) : PENDING_FINGERPRINT,
    (): RouterResult<InferRouteParams<R>> => {
      if (!isReady) return PENDING;
      // The merged query is a legal params source as-is: decodeParams reads
      // only the route's own segment names, never unknown keys. R5: next/router
      // has already percent-decoded `query`, so skip core's decode to avoid a
      // double-decode (`/product/a%2520b` → `"a%20b"` must survive as-is).
      return safeDecodeParams(route, query, { percentDecode: false });
    },
  );
  return useSelectedResult(result, options);
}

/**
 * Decoded search params as a {@link RouterResult} (PR5), optionally projected
 * through `options.select` (design-07 SEL1/SEL2).
 */
export function useSearch<R extends AnyPagesRoute>(
  route: R,
): RouterResult<SearchOutputOf<R["~search"]>>;
export function useSearch<R extends AnyPagesRoute, U>(
  route: R,
  options: SelectOptions<SearchOutputOf<R["~search"]>, U>,
): RouterResult<U>;
export function useSearch<R extends AnyPagesRoute, U>(
  route: R,
  options?: SelectOptions<SearchOutputOf<R["~search"]>, U>,
): RouterResult<SearchOutputOf<R["~search"]>> | RouterResult<U> {
  const { isReady, query } = usePagesRouter();
  const result = useStableResult(
    route,
    isReady ? queryFingerprint(route, query) : PENDING_FINGERPRINT,
    (): RouterResult<SearchOutputOf<R["~search"]>> => {
      if (!isReady) return PENDING;
      return safeDecodeSearch(route, omitPathParams(query, route));
    },
  );
  return useSelectedResult(result, options);
}

/**
 * `query` minus the route's own path-param names (PR5) — the client twin of
 * `parseContext`'s server-side subtraction (core route.ts, PR10). Entries →
 * fromEntries so a hostile `?__proto__=` key stays an ordinary own property
 * (decodeParams's ethos). Names come from the define-time `~segments` token
 * cache, so nothing re-tokenizes per render.
 */
function omitPathParams(
  query: ParamsSource,
  route: AnyPagesRoute,
): ParamsSource {
  const names = new Set<string>();
  for (const segment of route["~segments"]) {
    if (segment.kind !== "static") names.add(segment.name);
  }
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => !names.has(key)),
  );
}

/**
 * `useRouter` with the one failure the brand cannot catch translated (PR5):
 * in a hybrid project a component rendered under `app/` can legally hold a
 * pages-branded route, but `next/router` has no mount there and throws
 * "NextRouter was not mounted" — a message pointing at the wrong fix
 * (component placement is invisible to the type system). Rethrow a
 * `ParamourError` naming the actual mistake; everything else propagates.
 */
function usePagesRouter(): ReturnType<typeof useRouter> {
  try {
    return useRouter();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("NextRouter was not mounted")
    ) {
      throw new ParamourError(
        'pages hooks were rendered under the App Router, where next/router is never mounted — import this component\'s hooks from "@paramour-js/next/app" and pass it an app route instead (PR5)',
        { cause: error },
      );
    }
    throw error;
  }
}
