import type { AnyRoute, ParamsSource, RouterKind, SafeResult } from "paramour";

/**
 * The devtools observation seam: a dependency-free global
 * slot the hooks push decode observations into and the devtools panel
 * (`@paramour-js/devtools-panel`) reads out of. This module's JSDoc is the
 * CONTRACT OF RECORD for the slot — the panel never imports runtime code
 * from this package (its `./devtools-seam` exports entry is types-only, so
 * a runtime import fails module resolution); it attaches to the same
 * `globalThis` slot by key.
 *
 * - Slot key: `Symbol.for("paramour.devtools.seam")` — the realm-global
 *   symbol registry, the same cross-copy identity idiom as core's error
 *   brands: a second physical copy of this module (dual-package
 *   hazard, bundler duplication) mints the SAME symbol and lands on the
 *   same slot. Either side — hooks or panel — may create the slot; both
 *   sides are create-if-absent.
 * - The slot is DATA-ONLY (no function fields): a function property would
 *   close over whichever module copy created the slot first, letting a
 *   duplicated or version-skewed copy pin stale behavior. With plain data,
 *   every copy of the emit/attach code operates on shared state and
 *   `version` is the only skew guard needed.
 * - Protocol: subscribe = `listeners.add(fn)`; unsubscribe =
 *   `listeners.delete(fn)`; replay = synchronously read `buffer`, then
 *   `add` — same JS thread, so nothing can be emitted between the read and
 *   the add. Emitters push to `buffer` (FIFO-capped at
 *   {@link OBSERVATION_BUFFER_CAP}) and then invoke every listener.
 * - Production: every emit call site sits behind
 *   `process.env.NODE_ENV !== "production"`, which Next's compilers
 *   constant-fold; with the package's `sideEffects: false` the then-dead
 *   import of the emitter module (`devtools-emit.ts`) is dropped entirely.
 * - Stability: this module is the published, semver-covered contract. It
 *   declares TYPES ONLY — the emit/attach helpers live in the internal
 *   `devtools-emit.ts`, so a value import through the types-only
 *   `./devtools-seam` entry can't type-check. Closed-looking unions here
 *   (`ParamourHookId`, the observation `kind`s) are OPEN by policy: new
 *   hooks and observation kinds ship in minor releases, so consumers must
 *   tolerate members they don't recognize.
 */

/** The `Symbol.for("paramour.devtools.seam")` slot shape — the seam contract. */
export interface ParamourDevtoolsSeam {
  /** Capped FIFO; oldest dropped past the cap. Replay = read it. */
  readonly buffer: ParamourObservation[];
  /** Subscribe = add; unsubscribe = delete. Invoked synchronously per emit. */
  readonly listeners: Set<(observation: ParamourObservation) => void>;
  /**
   * Bumped only when an EXISTING field's semantics change; additive fields
   * never bump it.
   */
  readonly version: 1;
}

/**
 * Discriminant naming which hook reported. Open by policy: a new hook adds a
 * member in a minor release, so switch over it with a default branch.
 */
export type ParamourHookId =
  | "app.useRouteParams"
  | "app.useRouteParamsOrThrow"
  | "app.useSearch"
  | "app.useSearchOrThrow"
  | "pages.useRouteParams"
  | "pages.useSearch";

/**
 * Navigation capability captured from the EMITTING hook's router: the panel
 * commits URL edits through this, so it never guesses which router is live
 * and never imports Next. The panel passes ONLY the
 * serialized search string (`""` or `"?…"`); the hook resolves it against
 * its OWN current pathname — `usePathname()` (App) / `asPath`'s path part
 * (Pages), both basePath-/locale-relative, which is what `replace()`
 * expects back. The panel reading `window.location.pathname` instead would
 * double a configured basePath through `router.replace`. `replace`
 * semantics — the panel's commit-to-push editing is an experiment loop, and
 * history entries per experiment would make the back button a slog;
 * extending to an options bag later is additive.
 */
export type ParamourNavigate = (search: string) => void;

/**
 * One hook decode, reported on decode CHANGE — and
 * re-reported when the hook's resolution base moves under an unchanged
 * decode (a layout surviving `/product/1?q=a` → `/product/2?q=a`), so the
 * captured `navigate`/`pathname` never go stale while the hook is mounted.
 */
export type ParamourObservation =
  ParamourParamsObservation | ParamourSearchObservation;

/** Fields every observation carries, whatever its `kind`. */
export interface ParamourObservationBase {
  readonly hook: ParamourHookId;
  readonly navigate: ParamourNavigate;
  /**
   * The emitting hook's OWN resolution base at decode time —
   * `usePathname()` (App) / `asPath`'s path part (Pages), both
   * basePath-/locale-relative like {@link ParamourNavigate}'s. The panel
   * keys "is this session the page on screen?" on it (suffix-matched
   * against `window.location.pathname`, which DOES carry the prefix), so it
   * never has to reverse-engineer a configured basePath. Additive field —
   * no `version` bump.
   */
  readonly pathname: string;
  readonly result: ParamourObservationResult;
  /**
   * The LIVE route object (same JS context, no serialization) — the
   * panel calls `describeRoute`, the route's own codecs, and
   * `buildSearchString` on it directly.
   */
  readonly route: AnyRoute;
  readonly routerKind: RouterKind;
}

/**
 * Pre-`select` decode result: the hook's full `SafeResult` — the error arm
 * carries the LIVE `ParamsDecodeError`/`SearchDecodeError` with its
 * `issues` — never the user's `select` projection. `pending` is the
 * Pages-only third state. Generic-erased on purpose: the panel treats
 * `data` structurally.
 */
export type ParamourObservationResult =
  SafeResult<unknown> | { readonly status: "pending" };

/** Params decode: wire is a decode-time shallow copy of the source record. */
export interface ParamourParamsObservation extends ParamourObservationBase {
  readonly kind: "params";
  readonly wire: Readonly<ParamsSource>;
}

/**
 * Search decode: wire is decode-time `[key, value]` pairs in wire order —
 * order is load-bearing for repeated keys (P5/S5), and pairs round-trip
 * losslessly into the panel's raw-wire editing.
 */
export interface ParamourSearchObservation extends ParamourObservationBase {
  readonly kind: "search";
  readonly wire: ParamourSearchWire;
}

export type ParamourSearchWire = readonly (readonly [string, string])[];
