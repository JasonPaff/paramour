import { defineAppRoute, definePagesRoute, p } from "paramour";

// World A on purpose (no registry augmentation, paths fall back to `string`):
// the build gates below are about Next's build pipeline, not codegen.
export const legacyRoute = definePagesRoute("/legacy/[id]", {
  params: { id: p.integer() },
  search: { q: p.string().optional() },
});

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { q: p.string().optional() },
});
