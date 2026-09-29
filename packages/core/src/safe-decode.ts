import type { AnyRoute, InferRouteParams, SafeResult } from "./route.js";

import { ParamsDecodeError, SearchDecodeError } from "./errors.js";
import {
  decodeParams,
  type DecodeParamsOptions,
  type ParamsSource,
} from "./path.js";
import {
  decodeSearch,
  type InferSearchOutput,
  type SearchSlot,
  type SearchSource,
  type SlotOf,
} from "./search.js";

/**
 * Sync `SafeResult` twins of {@link decodeParams} / {@link decodeSearch},
 * carrying the route methods' safe-parse stance down to the
 * standalone-function layer: `safeParse*` awaits props, but sync callers —
 * client hooks, middleware, route handlers — already hold a
 * decoded-value-layer source. Same taxonomy as route.ts's `safely`: only a
 * decode failure becomes the `error` arm; source-contract violations,
 * rebranded foreign errors, and async-schema misuse stay loud and propagate
 * unchanged.
 */

/** Decoded route params as a `SafeResult` (discriminated on `status`). */
export function safeDecodeParams<R extends AnyRoute>(
  route: R,
  source: ParamsSource,
  options?: DecodeParamsOptions,
): SafeResult<InferRouteParams<R>, ParamsDecodeError> {
  try {
    return { data: decodeParams(route, source, options), status: "success" };
  } catch (error) {
    if (error instanceof ParamsDecodeError) return { error, status: "error" };
    throw error;
  }
}

/**
 * Decoded search params as a `SafeResult` (discriminated on `status`).
 * `target` is a route or a bare `search:` slot, as for {@link decodeSearch}.
 */
export function safeDecodeSearch<T extends AnyRoute | SearchSlot>(
  target: T,
  source: SearchSource,
): SafeResult<InferSearchOutput<SlotOf<T>>, SearchDecodeError> {
  try {
    return { data: decodeSearch(target, source), status: "success" };
  } catch (error) {
    if (error instanceof SearchDecodeError) return { error, status: "error" };
    throw error;
  }
}
