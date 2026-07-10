import { defineAppRoute, p } from "paramour";

// Defined at the URL shape — "/about", not "/(marketing)/about". Route groups
// are a filesystem organizing device; the artifact and the typed path space
// only ever see the served URL (TR2), so this def is indistinguishable from
// one whose page sits at app/about/.
export const aboutRoute = defineAppRoute("/about", {
  search: {
    // Attribution-style optional param: absent from the canonical URL.
    ref: p.string().optional(),
  },
});
