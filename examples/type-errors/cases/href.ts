import { href } from "paramour";

import { productRoute } from "../app/product/[id]/route.def";
import { homeRoute } from "../app/route.def";

// href() contract violations. Mirrors packages/core/test/route-api.tst.ts
// ("href arguments").

href(productRoute, {
  // @expect-error TS2322 — params take the codec Out type: id is number, not string
  params: { id: "1" },
  search: { q: "x" },
});

// @expect-error TS2345 — the required search member `q` is missing
href(productRoute, { params: { id: 1 } });

// @expect-error TS2322 — a route with no search config bans the search half outright
href(homeRoute, { search: { q: "x" } });

// @expect-error TS2554 — options are not omittable when params are required
href(productRoute);
