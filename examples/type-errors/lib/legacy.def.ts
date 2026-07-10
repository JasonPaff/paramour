import { definePagesRoute, p } from "paramour";

// Lives in lib/ because under pages/ every file with a page extension IS a
// page — a colocated def would register as a route (design-06 spike 1).
export const legacyRoute = definePagesRoute("/legacy/[id]", {
  params: { id: p.integer() },
});
