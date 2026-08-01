import { definePagesRoute, p } from "paramour";

// The hybrid route: one pages/ route beside the app/ tree. Its definition
// lives in lib/ because under pages/ every file with a page extension IS a
// page — a colocated route.def.ts would become the route /legacy/route.def.
export const legacyRoute = definePagesRoute("/legacy", {
  search: {
    ref: p.string().optional(),
  },
});
