import type { ParamourDevtoolsSeam } from "@paramour-js/next/devtools-seam";

/**
 * The panel's half of the observation seam (design-12 DT5). The contract of
 * record lives in `@paramour-js/next`'s `src/devtools-seam.ts`; this module
 * consumes it TYPES-ONLY via the `./devtools-seam` subpath export (which has
 * no runtime condition — a runtime import of it fails module resolution by
 * construction, enforcing "attach via the global only" mechanically). Both
 * sides are create-if-absent on the same `Symbol.for` key, so mount order —
 * hooks first or panel first — is irrelevant and pre-mount observations
 * replay from the buffer.
 */

export type {
  ParamourDevtoolsSeam,
  ParamourHookId,
  ParamourNavigate,
  ParamourObservation,
  ParamourObservationResult,
  ParamourParamsObservation,
  ParamourSearchObservation,
  ParamourSearchWire,
} from "@paramour-js/next/devtools-seam";

/** Same realm-global registry key the hooks use; see the contract of record. */
export const SEAM_KEY = Symbol.for("paramour.devtools.seam");

const globalSlots = globalThis as Record<
  symbol,
  ParamourDevtoolsSeam | undefined
>;

/** The slot, created on first touch by whichever side runs first (DT5). */
export function getOrCreateSeam(): ParamourDevtoolsSeam {
  const existing = globalSlots[SEAM_KEY];
  if (existing !== undefined) return existing;
  const created: ParamourDevtoolsSeam = {
    buffer: [],
    listeners: new Set(),
    version: 1,
  };
  globalSlots[SEAM_KEY] = created;
  return created;
}
