import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { AnyRoute } from "./route.js";

import { type Issue, SearchSourceError } from "./errors.js";
import { safeDecodeSearch } from "./safe-decode.js";
import {
  isRawSearch,
  requireSearchConfig,
  type SearchOutputOf,
  type SearchSlot,
  type SearchSource,
} from "./search.js";

/**
 * Standard Schema generate-OUT (design-08): exports a route's `search:`
 * config as a spec-compliant Standard Schema. The mirror of schema.ts, which
 * runs Standard Schemas coming IN.
 */

/**
 * The schema {@link standardSearchSchema} returns (STD1/STD3): input is
 * advertised as the wire-shaped record only — `URLSearchParams` is accepted
 * at runtime but kept out of the type, so client-side inference (tRPC) never
 * sees a shape that cannot serialize over JSON. Output is the route's decoded
 * search shape. `types` is carried by this annotation alone; the spec reads
 * it at the type level only, so no runtime key exists.
 */
export type StandardSearchSchema<SC> = StandardSchemaV1<
  Record<string, string | string[] | undefined>,
  SearchOutputOf<SC>
>;

/**
 * Exports a route's `search:` config as the URL wire contract in Standard
 * Schema form (design-08 STD1/STD5), for consumers like tRPC inputs or
 * TanStack `validateSearch`. Semantics are byte-identical to `decodeSearch`
 * (STD6): defaults apply, `.catch()` recovers parse failures — invalid API
 * input silently coerces to the fallback — unknown keys strip (P8), and
 * duplicate values on a scalar codec reject (P5). No coercion, ever (STD2):
 * the schema accepts wire strings (`"42"`), not decoded values (`42`).
 */
export function standardSearchSchema<R extends AnyRoute>(
  route: R,
): StandardSearchSchema<R["~search"]> {
  const config = route["~search"] as SearchSlot;
  // A missing/malformed config is a programming error and stays loud (STD7);
  // checking eagerly fails at construction, not at first validate().
  requireSearchConfig(config);
  // A config's raw/codec-map shape is fixed at construction; hoisted so the
  // sentinel un-mapping below never touches a codec map's keyed issues.
  const raw = isRawSearch(config);
  return {
    "~standard": {
      validate: (value) => {
        try {
          const result = safeDecodeSearch(route, value as SearchSource);
          if (result.status === "error") {
            return {
              issues: result.error.issues.map((issue) =>
                toStandardIssue(issue, raw),
              ),
            };
          }
          return { value: result.data };
        } catch (error) {
          // STD7: validate() receives genuinely untrusted input, so the
          // source-shape contract the read layer enforces with loud throws
          // softens to issues at this one boundary — SearchSourceError exists
          // as its own branded class exactly so this catch can't swallow
          // config-contract violations or rebranded validator throws.
          if (error instanceof SearchSourceError) {
            return { issues: [toSourceIssue(error)] };
          }
          // Async raw schema (design-02 D7), throwing raw validators, and
          // throwing .default()/.catch() factories are true programming
          // errors: loud (STD7).
          throw error;
        }
      },
      vendor: "paramour",
      version: 1,
    },
  };
}

/**
 * Maps a source-shape violation to spec shape (STD7): keyed where the read
 * layer could attribute it, root-level (absent path) for a malformed source.
 */
function toSourceIssue(error: SearchSourceError): StandardSchemaV1.Issue {
  return error.key === null
    ? { message: error.message }
    : { message: error.message, path: [error.key] };
}

/**
 * Maps a decode issue to spec shape. decodeRawSearch collapses a root-level
 * schema issue to the "<search>" sentinel key (SS3/SS4); a Standard Schema
 * expresses "root" as an ABSENT path, so the sentinel un-maps here (STD7
 * "root-level otherwise") — for raw configs only, since a codec map's issues
 * are always keyed and a param may literally be named "<search>". (A raw
 * vendor issue whose real path is ["<search>"] still collides with the
 * sentinel — indistinguishable after the flat-key collapse.) Nested
 * raw-schema paths were already dot-joined into the key and re-emit as ONE
 * segment — keys may contain dots, so splitting back would be unsound.
 */
function toStandardIssue(issue: Issue, raw: boolean): StandardSchemaV1.Issue {
  return raw && issue.key === "<search>"
    ? { message: issue.message }
    : { message: issue.message, path: [issue.key] };
}
