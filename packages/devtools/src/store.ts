import type { AnyRoute } from "paramour";

import type { ParamourNavigate, ParamourObservation } from "./seam.js";

import { matchesPathname } from "./match.js";
import { getOrCreateSeam } from "./seam.js";

/**
 * The panel's session store (design-12 DT10): a module-level singleton
 * shaped for `useSyncExternalStore`. It outlives panel mounts, so the
 * session history survives closing/reopening the shell; it attaches to the
 * seam on the FIRST subscriber (replaying the buffer — DT5) and detaches at
 * zero.
 */

/**
 * Per-data-key counters, incremented when that key's PARSED value changes
 * between observations — feeds DT18's row flash. Kept per HALF: an App
 * route may legally declare a search key named like a path param (PR9
 * forbids the collision only for pages routes), and a shared record would
 * cross-flash the other table's row.
 */
export interface ChangeStamps {
  readonly params: Readonly<Record<string, number>>;
  readonly search: Readonly<Record<string, number>>;
}

export interface DevtoolsSnapshot {
  /** Session keys classified as the page currently on screen (DT10). */
  readonly currentKeys: readonly string[];
  /** Every route observed this session, first-observed order. */
  readonly sessions: readonly RouteSession[];
}

/**
 * One observed route, keyed `${routerKind}:${path}` rather than by object
 * reference — HMR re-mints route objects on every save, and the composite
 * key keeps one session across re-mints while the latest route object wins
 * (its codecs are the live ones).
 */
export interface RouteSession {
  readonly changeStamps: ChangeStamps;
  readonly key: string;
  /**
   * The NEWEST observation's navigate, regardless of half (DT8): the other
   * half's closure can be older — its fingerprint may not have moved since
   * — and edits must always route through the freshest resolution base.
   */
  readonly navigate: ParamourNavigate;
  readonly params?: ParamourObservation;
  /** The NEWEST observation's basePath-relative pathname (DT8/DT10). */
  readonly pathname: string;
  readonly route: AnyRoute;
  readonly search?: ParamourObservation;
  /** error if any half errored, else pending if any half pends, else ok. */
  readonly status: "error" | "ok" | "pending";
}

const EMPTY_SNAPSHOT: DevtoolsSnapshot = { currentKeys: [], sessions: [] };

interface StoreState {
  /**
   * Observations already reduced into `sessions`. Sessions are a retained
   * module singleton (DT10) while the seam buffer also retains history for
   * replay (DT5) — without this, every re-attach (panel close/reopen) would
   * re-walk the buffer over sessions that already consumed it, inflating
   * change stamps with historical transitions.
   */
  consumed: WeakSet<ParamourObservation>;
  detach: (() => void) | undefined;
  listeners: Set<() => void>;
  /** Coalesces a synchronous burst of emits into one microtask wake-up. */
  notifyScheduled: boolean;
  /**
   * The location prefix the hooks never see (Next `basePath`, pages-router
   * locale), learned from any non-root currency match — the only way a
   * root ("/") observation can be classified current under one.
   */
  prefix: string | undefined;
  sessions: RouteSession[];
  snapshot: DevtoolsSnapshot;
  /** `location.href` when `snapshot` was minted — part of the bailout key. */
  snapshotHref: string;
}

const state: StoreState = {
  consumed: new WeakSet(),
  detach: undefined,
  listeners: new Set(),
  notifyScheduled: false,
  prefix: undefined,
  sessions: [],
  snapshot: EMPTY_SNAPSHOT,
  snapshotHref: "",
};

export function getServerSnapshot(): DevtoolsSnapshot {
  return EMPTY_SNAPSHOT;
}

export function getSnapshot(): DevtoolsSnapshot {
  return state.snapshot;
}

/**
 * The parsed record a change-stamp comparison keys on — and the route
 * view's table data (shared so the two can never diverge): the success
 * arm's data object; error/pending halves contribute nothing (a row that
 * stops parsing shows status, not a flash).
 */
export function parsedRecord(
  observation: ParamourObservation | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (observation === undefined) return undefined;
  if (observation.result.status !== "success") return undefined;
  const { data } = observation.result;
  if (typeof data !== "object" || data === null) return undefined;
  return data as Readonly<Record<string, unknown>>;
}

/**
 * Test hook: drop all sessions, cached snapshots, and any live seam
 * attachment (a component left mounted by a previous test must not pin the
 * store to a stale seam). Not in the barrel.
 */
export function resetStoreForTests(): void {
  if (state.detach !== undefined) {
    state.detach();
    state.detach = undefined;
  }
  state.consumed = new WeakSet();
  state.listeners.clear();
  state.notifyScheduled = false;
  state.prefix = undefined;
  state.sessions = [];
  state.snapshot = EMPTY_SNAPSHOT;
  state.snapshotHref = "";
}

/**
 * `useSyncExternalStore`-shaped subscribe. First subscriber: replay the
 * seam buffer through the reducer, then attach the live seam listener and
 * a `popstate` backup (a back/forward that changes no decode still moves
 * `currentKeys`). Last unsubscribe detaches both.
 */
export function subscribe(listener: () => void): () => void {
  if (state.listeners.size === 0) attach();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0 && state.detach !== undefined) {
      state.detach();
      state.detach = undefined;
    }
  };
}

function attach(): void {
  const seam = getOrCreateSeam();
  for (const observation of seam.buffer) reduce(observation);
  recomputeSnapshot();

  const onObservation = (observation: ParamourObservation): void => {
    reduce(observation);
    recomputeSnapshot();
    // Hooks emit render-phase (DT4), so a synchronous notify here would
    // setState the panel while the EMITTING component is still rendering —
    // React's "cannot update a component while rendering" violation. The
    // snapshot updates eagerly; only the React wake-up defers a microtask.
    scheduleNotify();
  };
  const onPopstate = (): void => {
    recomputeSnapshot();
    notify();
  };
  // Next commits client navigations via history.pushState/replaceState —
  // no popstate fires — and the hooks emit render-phase BEFORE that commit,
  // so the emit-time recompute reads the OLD pathname. Wrapping both is the
  // only signal that the URL actually moved; without it the freshly
  // navigated page classifies as a stale snapshot (editing disabled) until
  // some unrelated event.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- captured to restore on detach (identity preserved); only ever invoked via .call(window.history)
  const { pushState: originalPushState, replaceState: originalReplaceState } =
    window.history;
  const wrapCommit =
    (original: typeof originalPushState) =>
    (data: unknown, unused: string, url?: null | string | URL): void => {
      original.call(window.history, data, unused, url);
      recomputeSnapshot();
      // The commit runs inside React's own commit phase (an insertion
      // effect) — defer the wake-up exactly like an observation's.
      scheduleNotify();
    };
  const wrappedPushState = wrapCommit(originalPushState);
  const wrappedReplaceState = wrapCommit(originalReplaceState);
  window.history.pushState = wrappedPushState;
  window.history.replaceState = wrappedReplaceState;
  seam.listeners.add(onObservation);
  window.addEventListener("popstate", onPopstate);
  state.detach = () => {
    seam.listeners.delete(onObservation);
    window.removeEventListener("popstate", onPopstate);
    // Restore ONLY what is still ours: a library that patched history
    // AFTER the panel attached (lazy-loaded analytics, another devtools
    // plugin) holds our wrapper inside its own — a blind restore of the
    // attach-time functions would silently sever it for the rest of the
    // tab session. Its patch keeps working either way: our wrapper stays
    // in its chain and merely recomputes against a detached store.
    if (window.history.pushState === wrappedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === wrappedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
}

/** A malformed escape in a URL the panel merely OBSERVES must not throw. */
function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * Is this session the page currently on screen (DT10)? Two conditions:
 * the live location must still correspond to the session's last OBSERVED
 * pathname — a URL that moved with no fresh observation means the retained
 * `navigate` belongs to a page no longer mounted, so pattern-matching the
 * location alone would enable editing through a stale closure
 * (`/product/1` → `/product/2` with no re-emit) — and the route's own
 * pattern must match that observed pathname, so a session whose route
 * object mismatches where its hook actually rendered never claims currency.
 */
function isCurrent(locationPathname: string, session: RouteSession): boolean {
  return (
    locationCovers(locationPathname, session.pathname) &&
    matchesPathname(session.route["~segments"], session.pathname)
  );
}

/**
 * Does the live location correspond to `observed`? Observed pathnames are
 * basePath-/locale-relative (DT8) while `window.location.pathname` carries
 * the prefix, so the comparison is suffix-based — observed pathnames start
 * with "/", which makes plain `endsWith` boundary-safe. Percent-encoding
 * may differ between the two sources, so a failed raw comparison retries
 * decoded. Trailing slashes are normalization noise.
 */
function locationCovers(locationPathname: string, observed: string): boolean {
  const location = normalizePathname(locationPathname);
  const target = normalizePathname(observed);
  if (target === "/") {
    // No suffix to align on: only a prefix learned from an earlier
    // non-root match (or a prefix-less app) can verify a root observation.
    return location === "/" || location === state.prefix;
  }
  if (location.endsWith(target)) {
    state.prefix = location.slice(0, location.length - target.length);
    return true;
  }
  const decodedLocation = decodePathname(location);
  const decodedTarget = decodePathname(target);
  if (decodedLocation.endsWith(decodedTarget)) {
    state.prefix = decodedLocation.slice(
      0,
      decodedLocation.length - decodedTarget.length,
    );
    return true;
  }
  return false;
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function notify(): void {
  for (const listener of state.listeners) listener();
}

function recomputeSnapshot(): void {
  const { href, pathname } = window.location;
  const currentKeys = state.sessions
    .filter((session) => isCurrent(pathname, session))
    .map((session) => session.key);
  // Bail out when nothing observable moved: Next apps churn `replaceState`
  // (scroll restoration etc.), and minting a fresh snapshot every commit
  // defeats useSyncExternalStore's Object.is bailout — the whole panel
  // would re-render per commit. `href` participates because the route view
  // reads `location.href` (copy-URL) during render.
  if (
    href === state.snapshotHref &&
    state.snapshot.sessions === state.sessions &&
    sameKeys(state.snapshot.currentKeys, currentKeys)
  ) {
    return;
  }
  state.snapshotHref = href;
  // `reduce` reassigns `state.sessions` immutably, so the array can be
  // shared with the snapshot by reference.
  state.snapshot = { currentKeys, sessions: state.sessions };
}

function reduce(observation: ParamourObservation): void {
  // Attach-time replays walk the WHOLE buffer (DT5); anything the retained
  // sessions already consumed must not re-apply.
  if (state.consumed.has(observation)) return;
  state.consumed.add(observation);

  const key = `${observation.routerKind}:${observation.route.path}`;
  const index = state.sessions.findIndex((session) => session.key === key);
  const previous = index === -1 ? undefined : state.sessions[index];

  const half = observation.kind === "params" ? "params" : "search";
  const previousHalf = previous?.[half];
  const halfStamps = { ...previous?.changeStamps[half] };
  const before = parsedRecord(previousHalf);
  const after = parsedRecord(observation);
  if (after !== undefined) {
    for (const [dataKey, value] of Object.entries(after)) {
      const previousValue = before?.[dataKey];
      if (before !== undefined && !sameValue(previousValue, value)) {
        halfStamps[dataKey] = (halfStamps[dataKey] ?? 0) + 1;
      }
    }
  }
  const changeStamps: ChangeStamps = {
    params:
      half === "params" ? halfStamps : (previous?.changeStamps.params ?? {}),
    search:
      half === "search" ? halfStamps : (previous?.changeStamps.search ?? {}),
  };

  const merged: RouteSession = {
    changeStamps,
    key,
    navigate: observation.navigate,
    ...(half === "params"
      ? { params: observation }
      : previous?.params === undefined
        ? {}
        : { params: previous.params }),
    pathname: observation.pathname,
    route: observation.route,
    ...(half === "search"
      ? { search: observation }
      : previous?.search === undefined
        ? {}
        : { search: previous.search }),
    status: "ok",
  };
  const withStatus: RouteSession = { ...merged, status: statusOf(merged) };

  if (index === -1) {
    state.sessions = [...state.sessions, withStatus];
  } else {
    state.sessions = state.sessions.map((session, sessionIndex) =>
      sessionIndex === index ? withStatus : session,
    );
  }
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** Cheap stable comparison: JSON with Date-safe replacer, sorted keys. */
function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function scheduleNotify(): void {
  if (state.notifyScheduled) return;
  state.notifyScheduled = true;
  queueMicrotask(() => {
    state.notifyScheduled = false;
    notify();
  });
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value instanceof Date) return `date:${String(value.getTime())}`;
  if (Array.isArray(value)) {
    return `[${value.map((element) => stableStringify(element)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`,
      );
    return `{${entries.join(",")}}`;
  }
  if (typeof value === "bigint") return `${String(value)}n`;
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }
  return JSON.stringify(value);
}

function statusOf(session: RouteSession): "error" | "ok" | "pending" {
  const halves = [session.params, session.search];
  if (halves.some((half) => half?.result.status === "error")) return "error";
  if (halves.some((half) => half?.result.status === "pending")) {
    return "pending";
  }
  return "ok";
}
