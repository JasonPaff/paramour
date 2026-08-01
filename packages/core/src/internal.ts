/**
 * The `paramour/internal` entry: unstable helpers for derived tooling
 * (devtools, adapters), NOT for app authors and NOT covered by the public
 * API's stability expectations. These live off the main barrel on purpose —
 * the docs' Reference section documents the app-author surface, and these
 * exist solely so reflection-driven consumers (the devtools panel's
 * catch-attribution probe, edit preview, and synthesized-issue labels)
 * share core's implementation instead of re-deriving it.
 */
export { codecShapeLabel } from "./describe.js";
export { foreignMessage } from "./errors.js";
export { parseValue } from "./search.js";
