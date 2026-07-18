import { defineAppRoute, p } from "paramour";

// The nuqs-interop contract: an ORDINARY route definition (NQ3 — no
// restructuring, no base-codec exports; the modified codecs are exactly what
// @paramour-js/nuqs derives from). paramour owns this contract server-side
// and builds typed links INTO the page; nuqs owns the in-page client state
// via the parsers derived in search-params.ts (NQ11).
export const interopRoute = defineAppRoute("/interop", {
  search: {
    // One comma-separated wire value (CV1); .default([]) elides the empty
    // list (CV5/D8), and the derived parser clears it the same way (NQ4).
    labels: p.csv().default([]),
    // The clearOnDefault parity demo: page=1 never reaches the URL from
    // either writer (D8 on the server, clearOnDefault + wire-form eq on the
    // client — NQ5).
    page: p.integer().default(1),
    // Optional scalar: absent decodes as undefined server-side and null on
    // the nuqs side — each router's native spelling of "absent".
    q: p.string().optional(),
    // Date with wire-form equality: no hand-written eq comparator (NQ4).
    since: p.isoDate().optional(),
    // Repeated-key array (?tags=a&tags=b): derived as a nuqs multi parser
    // (NQ8a) — both sides speak the same repeated-key wire format.
    tags: p.stringArray(),
  },
});
