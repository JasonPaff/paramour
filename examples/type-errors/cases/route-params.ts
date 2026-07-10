import { defineAppRoute, p } from "paramour";

// Param-key exactness, on REGISTERED paths only — an unregistered path would
// fail earlier with the registry error and mask the key-level diagnostic.
// Mirrors packages/core/test/route-api.tst.ts ("params config exactness").

defineAppRoute("/product/[id]", {
  // @expect-error TS2322 — excess key: `extra` is not a segment, so its value slot is `never`
  params: { extra: p.string(), id: p.integer() },
});

// @expect-error TS2345 — a dynamic path requires a params config
defineAppRoute("/product/[id]", {});

// @expect-error TS2322 — static routes take no params: the params slot is `never`
defineAppRoute("/", { params: { x: p.string() } });
