import type { AnyRoute, ParamsSource, RouterKind } from "paramour";

import { useRef } from "react";

import type {
  ParamourHookId,
  ParamourNavigate,
  ParamourObservation,
  ParamourObservationResult,
  ParamourSearchWire,
} from "./devtools-seam.js";

import { emitObservation } from "./devtools-seam.js";

/**
 * Shared devtools seam wiring for the six read hooks (design-12 DT4/DT8):
 * the navigate builders (one per router flavor) and the per-hook emitter
 * that owns WHEN an observation goes out. Deliberately NO `"use client"`
 * directive — app.ts (which carries one) and pages.ts (which must not,
 * PR2) both import from here, like select.ts.
 *
 * Emission policy: the hooks call {@link DevtoolsEmitter.observe} from
 * inside the `useStableResult` compute — the SEL4 fingerprint cache miss IS
 * the decode-change dedup (DT4), and only render-phase can report the
 * OrThrow hooks' error observation before the rethrow. `observe` alone
 * would leave one staleness hole: a component that survives a navigation
 * whose decode is unchanged (`/product/1?q=a` → `/product/2?q=a` in a
 * layout) never recomputes, so its last-emitted `navigate` stays bound to
 * the OLD pathname — committing a panel edit through it would silently
 * navigate back to the old resource. {@link DevtoolsEmitter.refresh},
 * called render-phase after the stable result returns, closes it: when the
 * resolution base (or a HMR-reminted route) moved under a cached decode, it
 * re-emits the CACHED result with the fresh spec — decode stability (SEL4)
 * is untouched, only the seam payload is renewed.
 *
 * Production erasure (DT6): every call site keeps a literal
 * `process.env.NODE_ENV` guard the bundler constant-folds, and both emitter
 * methods early-return behind the same literal guard, so the
 * `emitObservation` import above is dead in a production bundle and drops
 * with `sideEffects: false`. The unconditional `useRef` here is the same
 * bargain the hooks already make for `useRouter`/`usePathname` — hook order
 * must not differ between dev and prod bundles.
 */

/** Per-hook emitter; see the module doc for the observe/refresh split. */
export interface DevtoolsEmitter {
  readonly observe: (
    spec: ObservationSpec,
    result: ParamourObservationResult,
  ) => void;
  readonly refresh: (spec: ObservationSpec) => void;
}

/**
 * Everything one emission needs, rebuilt per render so `navigate` and
 * `wire` always close over the CURRENT render's router/pathname/source.
 * Call sites construct it behind their literal dev guard (undefined in
 * prod), keeping prod allocation at zero.
 */
export interface ObservationSpec {
  readonly hook: ParamourHookId;
  readonly kind: "params" | "search";
  readonly navigate: ParamourNavigate;
  readonly pathname: string;
  readonly route: AnyRoute;
  readonly routerKind: RouterKind;
  /** Decode-time wire snapshot, taken fresh at each emission. */
  readonly wire: () => ParamourSearchWire | Readonly<ParamsSource>;
}

interface LastEmit {
  readonly pathname: string;
  readonly result: ParamourObservationResult;
  readonly route: AnyRoute;
}

/**
 * App-flavor navigate capability (DT8): `next/navigation`'s `replace`
 * returns void and resolves the basePath-/locale-relative join itself.
 */
export function makeAppNavigate(
  router: { replace: (href: string) => void },
  pathname: string,
): ParamourNavigate {
  return (search) => {
    router.replace(`${pathname}${search}${window.location.hash}`);
  };
}

/**
 * Pages-flavor navigate capability (DT8): `next/router`'s `replace` returns
 * a promise that REJECTS on routine navigation aborts (rapid re-commits
 * from the panel), marked with next's `cancelled` discriminant — those must
 * not surface as unhandled rejections. Anything else is a real failure
 * (render error, route-info error) silently discarding the user's edit, so
 * it is reported to the console instead of swallowed.
 */
export function makePagesNavigate(
  router: { replace: (url: string) => Promise<boolean> },
  pathname: string,
): ParamourNavigate {
  return (search) => {
    void router
      .replace(`${pathname}${search}${window.location.hash}`)
      .catch((error: unknown) => {
        if (!isCancelledNavigation(error)) console.error(error);
      });
  };
}

export function useDevtoolsEmitter(): DevtoolsEmitter {
  const ref = useRef<DevtoolsEmitter | null>(null);
  ref.current ??= createEmitter();
  return ref.current;
}

function createEmitter(): DevtoolsEmitter {
  let last: LastEmit | null = null;
  const observe = (
    spec: ObservationSpec,
    result: ParamourObservationResult,
  ): void => {
    if (process.env.NODE_ENV === "production") return;
    last = { pathname: spec.pathname, result, route: spec.route };
    // `kind` and `wire` are pairwise-correct by construction at the six
    // call sites; the correlated union is beyond TS narrowing, hence the
    // cast.
    emitObservation({
      hook: spec.hook,
      kind: spec.kind,
      navigate: spec.navigate,
      pathname: spec.pathname,
      result,
      route: spec.route,
      routerKind: spec.routerKind,
      wire: spec.wire(),
    } as ParamourObservation);
  };
  return {
    observe,
    refresh: (spec: ObservationSpec): void => {
      if (process.env.NODE_ENV === "production") return;
      if (last === null) return;
      if (last.pathname === spec.pathname && last.route === spec.route) return;
      observe(spec, last.result);
    },
  };
}

/** Next's pages router marks genuine navigation aborts with `cancelled`. */
function isCancelledNavigation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { cancelled?: unknown }).cancelled === true
  );
}
