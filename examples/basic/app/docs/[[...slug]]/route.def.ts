import { defineAppRoute, p } from "paramour";

export const docsRoute = defineAppRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
  search: { page: p.integer().optional() },
});
