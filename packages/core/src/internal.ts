/**
 * The `paramour/internal` entry: unstable helpers for derived tooling
 * (devtools, adapters), NOT for app authors and NOT covered by the public
 * API's stability expectations. These live off the main barrel on purpose —
 * the docs' Reference section documents the app-author surface, and these
 * two exist solely so reflection-driven consumers (the devtools panel's
 * catch-attribution probe and edit preview, design-12 DT7) share core's
 * implementation instead of re-deriving it.
 */
export { foreignMessage } from "./errors.js";
export { parseValue } from "./search.js";
