import { defineRoute, p } from "paramour";

// An optional catch-all: `slug` decodes to a string[] — [] at /docs, the
// segments otherwise (D6 normalizes absent → []). The param codec describes ONE
// segment; the array comes from the segment kind.
export const docsRoute = defineRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
  search: { page: p.integer().optional() },
});
