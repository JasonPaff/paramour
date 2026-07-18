import type { AnyRoute } from "paramour";

import type {
  ParamourDevtoolsSeam,
  ParamourHookId,
  ParamourObservation,
  ParamourObservationResult,
  ParamourSearchWire,
} from "../src/seam.js";

import { SEAM_KEY } from "../src/seam.js";
import { resetStoreForTests } from "../src/store.js";

/**
 * The seam contract is STRUCTURAL (design-12 DT5), so tests hand-build the
 * data-only slot and assign it to the well-known global key — no seam-write
 * export needed, and the fabrication doubles as a contract check: if the
 * panel stops reading this shape, every test here breaks.
 */

/** Push through the slot protocol: buffer, then listeners, like a real emit. */
export function emitToSeam(
  seam: ParamourDevtoolsSeam,
  observation: ParamourObservation,
): void {
  seam.buffer.push(observation);
  for (const listener of seam.listeners) listener(observation);
}

/** A fresh slot installed at the global key, plus a clean store. */
export function freshSeam(): ParamourDevtoolsSeam {
  const seam: ParamourDevtoolsSeam = {
    buffer: [],
    listeners: new Set(),
    version: 1,
  };
  (globalThis as Record<symbol, ParamourDevtoolsSeam | undefined>)[SEAM_KEY] =
    seam;
  resetStoreForTests();
  return seam;
}

export function paramsObservation(
  route: AnyRoute,
  wire: Readonly<Record<string, string | string[] | undefined>>,
  result: ParamourObservationResult,
  overrides?: {
    readonly hook?: ParamourHookId;
    readonly navigate?: (url: string) => void;
    readonly pathname?: string;
  },
): ParamourObservation {
  return {
    hook: overrides?.hook ?? "app.useRouteParams",
    kind: "params",
    navigate: overrides?.navigate ?? (() => undefined),
    // Real hooks report their OWN basePath-relative pathname; tests that set
    // the URL first get the matching default, basePath tests override.
    pathname: overrides?.pathname ?? window.location.pathname,
    result,
    route,
    routerKind: route["~router"],
    wire,
  };
}

export function searchObservation(
  route: AnyRoute,
  wire: ParamourSearchWire,
  result: ParamourObservationResult,
  overrides?: {
    readonly hook?: ParamourHookId;
    readonly navigate?: (url: string) => void;
    readonly pathname?: string;
  },
): ParamourObservation {
  return {
    hook: overrides?.hook ?? "app.useSearch",
    kind: "search",
    navigate: overrides?.navigate ?? (() => undefined),
    pathname: overrides?.pathname ?? window.location.pathname,
    result,
    route,
    routerKind: route["~router"],
    wire,
  };
}

/** Point happy-dom's location at a path so current-URL matching sees it. */
export function setUrl(pathAndQuery: string): void {
  window.history.replaceState(null, "", pathAndQuery);
}
