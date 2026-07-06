import {
  type AnyRoute,
  decodeParams,
  decodeSearch,
  type InferRouteParams,
  type InferSearchOutput,
  ParamsDecodeError,
  type SafeResult,
  SearchDecodeError,
  type SearchSource,
} from "paramour";

/**
 * The value-layer params source (Next's `params` / `useParams()` shape).
 * Core exports this shape structurally but not the `ParamsSource` alias from
 * its barrel, so it is spelled inline here — identical to `decodeParams`'s
 * own parameter type.
 */
export type ParamsSourceInput = Record<string, string | string[] | undefined>;

/**
 * Sync `SafeResult` wrapper around core's {@link decodeParams} — the
 * non-React core the client hooks build on. Mirrors core's server-side
 * `safely` (route.ts): a params decode failure ({@link ParamsDecodeError})
 * becomes the `error` arm; every other throw — a source-contract violation,
 * a rebranded foreign error, an async-schema misuse (design-04 SS4) — stays
 * loud and propagates unchanged.
 */
export function safeDecodeParams<R extends AnyRoute>(
  route: R,
  source: ParamsSourceInput,
): SafeResult<InferRouteParams<R>> {
  try {
    return { data: decodeParams(route, source) };
  } catch (error) {
    if (error instanceof ParamsDecodeError) return { error };
    throw error;
  }
}

/**
 * Sync `SafeResult` wrapper around core's {@link decodeSearch}. Same stance
 * as {@link safeDecodeParams}: only a {@link SearchDecodeError} becomes the
 * `error` arm; anything else propagates. Reads the route's blessed-internal
 * `~search` config (design-03 RL6 — `@paramour/next` is a sanctioned
 * consumer).
 */
export function safeDecodeSearch<R extends AnyRoute>(
  route: R,
  source: SearchSource,
): SafeResult<InferSearchOutput<R["~search"]>> {
  try {
    return { data: decodeSearch(route["~search"], source) };
  } catch (error) {
    if (error instanceof SearchDecodeError) return { error };
    throw error;
  }
}
