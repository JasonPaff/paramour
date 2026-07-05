import { defineRoute, p } from "paramour";

export const docsRoute = defineRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
  search: { page: p.integer().optional() },
});
