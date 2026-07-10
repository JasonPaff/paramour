import { defineAppRoute, p } from "paramour";

// One def, two parallel render surfaces: the page AND the @stats slot both
// decode this route's search state. The slot never appears in the artifact
// (the scanner skips @ subtrees, TR2) — route objects are currency, so a
// scanner-invisible surface consumes typed params exactly like a page.
export const dashboardRoute = defineAppRoute("/dashboard", {
  search: {
    // .default("7d") elides — the canonical dashboard URL is bare /dashboard
    // (D8); only 30d/90d ever reach the wire.
    range: p.enum(["7d", "30d", "90d"]).default("7d"),
  },
});
