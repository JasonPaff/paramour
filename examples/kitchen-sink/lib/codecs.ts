import type { SearchConfig } from "paramour";

import { p } from "paramour";

/**
 * A standalone search config (a codec map, NOT a Route) for the serialization
 * playground: decodeSearch / encodeSearch / searchToString operate on this
 * directly, framework-free. Mixes a defaulted scalar (D8 elision), an optional
 * scalar, the arity-"many" array codec, and p.csv — the first-class
 * comma-separated list in ONE wire value (arity "single", strict grammar:
 * empty segments are ParseErrors, comma-carrying elements are SerializeErrors,
 * and the full modifier set applies).
 */
export const demoSearch = {
  labels: p.csv(),
  page: p.integer().default(1),
  q: p.string().optional(),
  tags: p.stringArray(),
} satisfies SearchConfig;
