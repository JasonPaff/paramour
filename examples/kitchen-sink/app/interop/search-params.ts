import { nuqsParsers } from "@paramour-js/nuqs";

import { interopRoute } from "./route.def";

// The ENTIRE paramour↔nuqs bridge (NQ12). Presence, defaults, catch
// recovery, and equality are read off the route's codecs — nothing is
// declared twice. The result is ordinary nuqs currency: useQueryStates here,
// and createSerializer/createLoader/the server cache would take it as-is.
export const interopParsers = nuqsParsers(interopRoute);
