import type { ParamsSource } from "paramour";

import type {
  ParamourDevtoolsSeam,
  ParamourObservation,
  ParamourSearchWire,
} from "./devtools-seam.js";

/**
 * The hooks' side of the devtools seam: the emit helpers behind the
 * contract in `devtools-seam.ts`. Internal — never exported from the
 * package; the panel re-implements the attach side against the contract.
 * The emitted JS here imports NOTHING (every import above is type-only) —
 * load-bearing for the production erasure described in the contract.
 */

/**
 * 128: replay only needs the pre-panel-mount window. One observation per
 * decode CHANGE per hook means even a long pre-open session is dozens
 * of entries, not thousands; the panel keys on route, so depth beyond
 * "every route seen recently" adds nothing — the cap mostly bounds how many
 * live route/result references the buffer retains.
 */
export const OBSERVATION_BUFFER_CAP = 128;

const SEAM_KEY = Symbol.for("paramour.devtools.seam");

const globalSlots = globalThis as Record<
  symbol,
  ParamourDevtoolsSeam | undefined
>;

/**
 * Pushes one observation and notifies listeners. The internal production
 * early-return is belt-and-suspenders (every call site is ALSO guarded,
 * which is what the bundler erases); it makes the guard directly
 * unit-testable and keeps a future unguarded call site failing safe.
 */
export function emitObservation(observation: ParamourObservation): void {
  if (process.env.NODE_ENV === "production") return;
  const seam = getParamourSeam();
  seam.buffer.push(observation);
  if (seam.buffer.length > OBSERVATION_BUFFER_CAP) seam.buffer.shift();
  for (const listener of seam.listeners) {
    try {
      listener(observation);
    } catch {
      // A panel bug must never break app render — emit runs render-phase.
    }
  }
}

/**
 * The slot, created on first touch by whichever side (hooks or panel) runs
 * first.
 */
export function getParamourSeam(): ParamourDevtoolsSeam {
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

/**
 * Pages `query` record → wire pairs; `string[]` values expand to repeated
 * keys in array order, `undefined` values are wire absence and are skipped.
 */
export function recordWireSnapshot(source: ParamsSource): ParamourSearchWire {
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const element of value) pairs.push([key, element]);
    } else {
      pairs.push([key, value]);
    }
  }
  return pairs;
}

/**
 * Decode-time freeze of the (live, mutable) `URLSearchParams` into wire
 * pairs: the observation outlives the render in the ring buffer, so it must
 * capture what the DECODE saw, not a live view.
 */
export function searchWireSnapshot(
  source: URLSearchParams,
): ParamourSearchWire {
  const pairs: [string, string][] = [];
  for (const [key, value] of source) pairs.push([key, value]);
  return pairs;
}
