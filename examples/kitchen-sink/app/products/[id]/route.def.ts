import { defineAppRoute, p } from "paramour";

import { positiveInt, searchQuery } from "../../../lib/schemas";

// The flagship route: a single [id] param plus a search config that exercises
// most of the codec/modifier surface. Search keys are alphabetized (ESLint
// perfectionist) — declaration order only affects encode output ordering.
export const productsRoute = defineAppRoute("/products/[id]", {
  params: {
    // p.integer refined by a Standard Schema (Zod): grammar first, then the
    // positive-whole-number schema. A schema failure throws ParseError too.
    id: p.integer(positiveInt),
  },
  search: {
    // p.boolean — only literal "true"/"false" on the wire; optional.
    inStock: p.boolean().optional(),
    // p.number — an optional decimal (distinct from integer's grammar).
    minPrice: p.number().optional(),
    // p.integer with a VALUE .default(): D8 elision drops page=1 from built URLs.
    page: p.integer().default(1),
    // p.string refined by a Zod schema (min length 2), optional.
    q: p.string(searchQuery).optional(),
    // p.enum with BOTH .default() and .catch(): absent → "relevance"; a garbage
    // value (?sort=nope) recovers to "relevance" rather than failing the decode.
    sort: p
      .enum(["relevance", "price", "newest"])
      .default("relevance")
      .catch("relevance"),
    // p.stringArray — the arity-"many" codec: ?tags=a&tags=b decodes to
    // ["a","b"]; absent decodes to []. Presence modifiers are banned here.
    tags: p.stringArray(),
  },
});
