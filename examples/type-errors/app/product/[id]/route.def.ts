import { defineAppRoute, p } from "paramour";

// `q` is deliberately required (no .optional()) — cases/href.ts needs a
// route with a required search member to demonstrate its omission erroring.
export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string(),
  },
});
