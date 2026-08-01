import { defineAppRoute, p } from "paramour";

// An optional catch-all: `slug` decodes to a string[] — [] at /docs, the
// segments otherwise (an absent catch-all normalizes to []). The param codec
// describes ONE segment; the array comes from the segment kind.
export const docsRoute = defineAppRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
  search: { page: p.integer().optional() },
});
