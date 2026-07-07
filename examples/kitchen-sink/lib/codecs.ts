import type { SearchConfig } from "paramour";

import { p } from "paramour";

/**
 * A p.custom codec — the fully-custom bidirectional escape hatch. Standard
 * Schema is validate-only, so a transform like this (a `string[]` in memory, a
 * URL-safe `"a,b,c"` on the wire) is precisely what codecs exist for. Foreign
 * throws from parse/serialize are rebranded to ParseError/SerializeError.
 */
export const csvList = p.custom<string[]>({
  parse: (raw) => raw.split(",").filter((segment) => segment !== ""),
  serialize: (value) => value.join(","),
});

/**
 * A standalone search config (a codec map, NOT a Route) for the serialization
 * playground: decodeSearch / encodeSearch / searchToString operate on this
 * directly, framework-free. Mixes a defaulted scalar (D8 elision), an optional
 * scalar, the arity-"many" array codec, and the custom CSV codec.
 */
export const demoSearch = {
  labels: csvList,
  page: p.integer().default(1),
  q: p.string().optional(),
  tags: p.stringArray(),
} satisfies SearchConfig;
