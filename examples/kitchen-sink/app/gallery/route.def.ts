import { defineAppRoute } from "paramour";

// The grid. Static path, no search — href(galleryRoute) takes no options.
export const galleryRoute = defineAppRoute("/gallery", {});
