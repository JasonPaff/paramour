import { defineAppRoute, p } from "paramour";

// ONE def, THREE render surfaces: the full page at [photoId]/, the
// intercepting modal at @modal/(.)[photoId]/, and /feed's inline preview at
// feed/(..)gallery/[photoId]/. All three serve this same URL shape, so they
// all decode params through this object — the interception conventions are
// pure render plumbing and never produce a second route.
export const galleryPhotoRoute = defineAppRoute("/gallery/[photoId]", {
  params: {
    photoId: p.integer(),
  },
});
