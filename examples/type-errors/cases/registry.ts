import { defineAppRoute, definePagesRoute, p } from "paramour";

// World-B registry errors — the rejections that exist ONLY because the
// generated paramour-env.d.ts narrows each constructor's path argument to
// its registered union. Mirrors packages/core/test-registry/route-registry.tst.ts.

// @expect-error TS2345 — unregistered path: the world-A any-literal fallback is gone
defineAppRoute("/totally/made/up", {});

// @expect-error TS2345 — near miss: the registered route is /product/[id], not [productId]
defineAppRoute("/product/[productId]", {
  params: { productId: p.integer() },
});

// @expect-error TS2345 — /legacy/[id] is a pages route; the app constructor rejects it
defineAppRoute("/legacy/[id]", { params: { id: p.integer() } });

// @expect-error TS2345 — /product/[id] is an app route; the pages constructor rejects it
definePagesRoute("/product/[id]", { params: { id: p.integer() } });

// @expect-error TS2345 — "/" is registered only as an app route
definePagesRoute("/", {});
