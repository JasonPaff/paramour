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
import { useMemo } from "react";

/**
 * Pages Router hooks (design-06 PR5/PR6). Deliberately NO `"use client"`
 * directive on this module: the directive is an App Router (RSC graph)
 * concept, meaningless in a `pages/` bundle (PR2).
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
 * Both hooks are gated to `AnyPagesRoute` (PR3) and stay a `useMemo` over
 * the `useRouter()` value, keyed on `query` + `isReady` — pure and
 * React-Compiler-friendly, the same discipline as the /app hooks.
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

/** Decoded route params as a {@link RouterResult} (PR5). */
export function useRouteParams<R extends AnyPagesRoute>(
  route: R,
): RouterResult<InferRouteParams<R>> {
  const { isReady, query } = usePagesRouter();
  return useMemo(() => {
    if (!isReady) return PENDING;
    // The merged query is a legal params source as-is: decodeParams reads
    // only the route's own segment names, never unknown keys.
    return safeDecodeParams(route, query);
  }, [isReady, query, route]);
}

/** Decoded search params as a {@link RouterResult} (PR5). */
export function useSearch<R extends AnyPagesRoute>(
  route: R,
): RouterResult<SearchOutputOf<R["~search"]>> {
  const { isReady, query } = usePagesRouter();
  return useMemo(() => {
    if (!isReady) return PENDING;
    return safeDecodeSearch(route, omitPathParams(query, route));
  }, [isReady, query, route]);
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
