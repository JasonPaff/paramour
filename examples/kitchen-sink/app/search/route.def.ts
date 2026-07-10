import { defineAppRoute, p } from "paramour";

import { positiveInt } from "../../lib/schemas";

// A LEGACY vocabulary on purpose (keyword/product/tag, not q/tags): /search
// exists only to be redirected away from, translating old keys into the
// /products ones on the server. positiveInt makes ?product=-5 a decode
// failure, exercising the fallback path.
export const searchRoute = defineAppRoute("/search", {
  search: {
    // The old name for q.
    keyword: p.string().optional(),
    // An old deep link straight to a product — moved for good (308).
    product: p.integer(positiveInt).optional(),
    // The old singular spelling of tags.
    tag: p.stringArray(),
  },
});
