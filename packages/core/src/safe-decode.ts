import type { AnyRoute, InferRouteParams, SafeResult } from "./route.js";

import { ParamsDecodeError, SearchDecodeError } from "./errors.js";
import { decodeParams, type ParamsSource } from "./path.js";
import {
  decodeSearch,
  type SearchOutputOf,
  type SearchSource,
} from "./search.js";

/**
 * Sync `SafeResult` twins of {@link decodeParams} / {@link decodeSearch}
 * (RL6's stance at the standalone-function layer): the route methods'
 * `safeParse*` surface awaits props, but sync callers — client hooks,
 * middleware, route handlers — already hold a decoded-value-layer source.
 * Same taxonomy as route.ts's `safely`: only a decode failure becomes the
 * `error` arm; source-contract violations, rebranded foreign errors, and
 * async-schema misuse (design-02 D7) stay loud and propagate unchanged.
 */

/** Decoded route params as a `SafeResult` (discriminated on `status`, PR12). */
export function safeDecodeParams<R extends AnyRoute>(
  route: R,
  source: ParamsSource,
): SafeResult<InferRouteParams<R>> {
  try {
    return { data: decodeParams(route, source), status: "success" };
  } catch (error) {
    if (error instanceof ParamsDecodeError) return { error, status: "error" };
    throw error;
  }
}

/** Decoded search params as a `SafeResult` (discriminated on `status`, PR12). */
export function safeDecodeSearch<R extends AnyRoute>(
  route: R,
  source: SearchSource,
): SafeResult<SearchOutputOf<R["~search"]>> {
  try {
    // decodeSearch is keyed on SearchOutputOf (design-04 SS6) — the correct
    // public type — but AnyRoute erases its SC to `any`, so for a still-
    // generic R the call's value side reduces to `unknown` while the
    // annotation side stays deferred. The cast bridges that inference gap to
    // the SAME (correct) type.
    return {
      data: decodeSearch(route["~search"], source) as SearchOutputOf<
        R["~search"]
      >,
      status: "success",
    };
  } catch (error) {
    if (error instanceof SearchDecodeError) return { error, status: "error" };
    throw error;
  }
}
