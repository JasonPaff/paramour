/**
 * The `paramour/internal` entry: helpers for derived tooling (devtools,
 * adapters), NOT for app authors — they live off the main barrel so the
 * docs' Reference section stays the app-author surface. Covered by semver
 * within a major all the same (additions only until the next major): the
 * devtools panel peers on `paramour` with a caret range, so a newer core
 * must never break an installed panel that imports from here. These exist
 * so reflection-driven consumers (the panel's synthesized-issue labels and
 * foreign-error rendering) share core's implementation instead of
 * re-deriving it.
 */
export { codecShapeLabel } from "./describe.js";
export { foreignMessage } from "./errors.js";
