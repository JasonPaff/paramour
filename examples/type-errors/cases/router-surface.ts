import { productRoute } from "../app/product/[id]/route.def";
import { legacyRoute } from "../lib/legacy.def";

// Router-surface gating: each route object exposes only its own router's
// parse surface — the wrong surface is ABSENT, not merely ill-typed.
// Mirrors packages/core/test/route-api.tst.ts ("router surfaces").

// @expect-error TS2339 — parseContext exists only on pages routes
productRoute.parseContext({ query: {} });

// @expect-error TS2339 — parse exists only on app routes
legacyRoute.parse({});
