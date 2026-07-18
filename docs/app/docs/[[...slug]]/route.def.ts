import { defineAppRoute, p } from "paramour";

// Optional catch-all: the codec describes one segment element; the
// array-ness comes from the segment kind. `/docs` decodes slug to [].
export const docsRoute = defineAppRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
});
