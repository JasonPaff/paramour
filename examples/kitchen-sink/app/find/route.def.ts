import { defineAppRoute, rawSearch } from "paramour";

import { findSchema } from "../../lib/schemas";

// The whole-object search escape hatch: instead of a per-key codec map, the
// entire query object is validated by one Standard Schema. The schema owns
// every key (unknown keys are the schema's to strip), there are no per-key
// .default()/.catch(), and encode is a raw pass-through (SS5/SS7).
export const findRoute = defineAppRoute("/find", {
  search: rawSearch(findSchema),
});
