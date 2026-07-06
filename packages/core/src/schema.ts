import type { StandardSchemaV1 } from "@standard-schema/spec";

import { ParamourError } from "./errors.js";

/**
 * Runs a Standard Schema synchronously and returns the raw result. Standard
 * Schema permits async validation, but URL parsing must be sync — an async
 * schema is a documented runtime error (design-02 D7). Shared by `p.ts`
 * (which joins `result.issues` into one message string) and the raw-search
 * decode path (which needs structured `Issue[]` with `path`) — each call
 * site maps issues its own way (plan-04 step 1).
 */
export function runStandardSchemaSync<Out>(
  schema: StandardSchemaV1<unknown, Out>,
  value: unknown,
): StandardSchemaV1.Result<Out> {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new ParamourError(
      "Async Standard Schema validation is not supported: URL parsing must be synchronous",
    );
  }
  return result;
}
