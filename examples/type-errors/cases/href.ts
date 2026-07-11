import { href } from "paramour";

import { productRoute } from "../app/product/[id]/route.def";
import { homeRoute } from "../app/route.def";

// href() contract violations. Mirrors packages/core/test/route-api.tst.ts
// ("href arguments"). Since the string overload landed (SH8), failing
// route-object calls report TS2769 anchored at the call — the specific
// diagnosis lives in the "last overload gave the following error" detail.

// @expect-error TS2769 — params take the codec Out type: id is number, not string
href(productRoute, {
  params: { id: "1" },
  search: { q: "x" },
});

// @expect-error TS2769 — the required search member `q` is missing
href(productRoute, { params: { id: 1 } });

// @expect-error TS2769 — a route with no search config bans the search half outright
href(homeRoute, { search: { q: "x" } });

// @expect-error TS2345 — options are not omittable when params are required;
// arity 1 matches only the string overload, so its error reports directly
href(productRoute);

// String form (SH1/SH2). This example registers "/" and "/product/[id]" as
// app routes — so "/" is the only registered STATIC path.

// @expect-error TS2769 — unregistered string: the world-A fallback is gone
href("/about");

// @expect-error TS2769 — a dynamic path string needs a route object (SH7)
href("/product/[id]");

// @expect-error TS2769 — the string form is hash-only: no raw-search side door (SH4)
href("/", { search: { q: "x" } });
