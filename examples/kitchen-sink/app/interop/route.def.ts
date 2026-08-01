import { defineAppRoute, p } from "paramour";

// The nuqs-interop contract: an ORDINARY route definition — no restructuring,
// no base-codec exports; the modified codecs are exactly what
// @paramour-js/nuqs derives from. paramour owns this contract server-side and
// builds typed links INTO the page; nuqs owns the in-page client state via the
// parsers derived in search-params.ts.
export const interopRoute = defineAppRoute("/interop", {
  search: {
    // One comma-separated wire value; .default([]) elides the empty list, and
    // the derived parser clears it the same way.
    labels: p.csv().default([]),
    // The clearOnDefault parity demo: page=1 never reaches the URL from
    // either writer — default elision on the server, clearOnDefault plus
    // wire-form equality on the client.
    page: p.integer().default(1),
    // Optional scalar: absent decodes as undefined server-side and null on
    // the nuqs side — each router's native spelling of "absent".
    q: p.string().optional(),
    // Date with wire-form equality: no hand-written eq comparator.
    since: p.isoDate().optional(),
    // Repeated-key array (?tags=a&tags=b): derived as a nuqs multi parser —
    // both sides speak the same repeated-key wire format.
    tags: p.array(),
  },
});
