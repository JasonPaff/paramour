import { defineAppRoute } from "paramour";

// The %5F escape (Next "Project Organization" → private folders): a folder
// named `%5Finternal` on disk serves the URL segment `_internal`, opting the
// leading underscore out of the private-folder convention. The scanner
// decodes the same escape (Bug 8), so the typed path is the URL shape —
// "/_internal", never the raw fs name. Defined here in lib/ rather than
// colocated because an import specifier containing "%" is percent-decoded by
// URL-based ESM resolvers, and this def must be importable from anywhere.
export const internalRoute = defineAppRoute("/_internal", {});
