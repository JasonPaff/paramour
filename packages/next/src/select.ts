import type { AnyRoute, ParamsSource, SafeResult } from "paramour";

import { useRef } from "react";

/**
 * Shared internals of the read hooks' selector surface (design-07): the
 * raw-slice stabilization layer (SEL4) and the selector layer (SEL2/SEL3).
 * Deliberately NO `"use client"` directive: app.ts (which carries one) and
 * pages.ts (which must not carry one, design-06 PR2) both import from here,
 * and the directive belongs on the entry modules, not a shared leaf.
 *
 * Both layers are `useRef` caches mutated during render (SEL8) — the
 * Redux/TanStack selector pattern, and the one sanctioned departure from the
 * hooks' pure-`useMemo` discipline: result equality needs memory across
 * renders, which no pure memo can provide. Every cache is cleared BEFORE a
 * compute that can throw, so a throwing decode or selector never strands a
 * stale entry.
 */

/**
 * Options bag accepted by every read hook (design-07 SEL1).
 */
export interface SelectOptions<T, U> {
  /**
   * Result-equality mode for the selected value (SEL3): `Object.is` by
   * default — free and correct for primitive selections — with one-level
   * `"shallow"` as the opt-in for tuple/object selections.
   */
  readonly equality?: "shallow";
  /**
   * Pure projection of the decoded value; runs only on the success arm
   * (SEL2). Identity is never compared, so inline arrows are fine — and when
   * the underlying result is reference-stable the selector is NOT re-run
   * (SEL6), so it must not read changing outside state. A throw propagates to
   * the nearest error boundary (SEL5): a selector bug is a code bug, never
   * the `SafeResult` error arm, which is reserved for URL data problems.
   */
  readonly select: (value: T) => U;
}

/**
 * Fingerprint of the pages hooks' pre-`isReady` state (design-06 PR5). Every
 * real fingerprint is a `JSON.stringify`'d array (starts with `[`), so this
 * can never collide with one.
 */
export const PENDING_FINGERPRINT = "pending";

interface SelectedResultCache<T, U> {
  input: T;
  readonly wrapped: { data: U; status: "success" };
}

/**
 * Both arms of a compute are cacheable (SEL8): a THROWING decode is as much
 * a function of `(route, fingerprint)` as a success is, so the same invalid
 * URL rethrows the SAME error without recomputing — which also keeps the
 * OrThrow hooks' error observation from re-emitting on every re-render
 * while the URL stays invalid (DT4).
 */
type StableOutcome<T> =
  | { readonly status: "thrown"; readonly thrown: unknown }
  | { readonly status: "value"; readonly value: T };

interface StableResultCache<T> {
  readonly fingerprint: string;
  readonly outcome: StableOutcome<T>;
  readonly route: AnyRoute;
}

/**
 * Raw slice of a params source (SEL4): the route's dynamic segment names'
 * raw values, from the define-time `~segments` token cache. Unknown keys —
 * e.g. a parallel route's params in the same `useParams()` bag — never bust
 * the fingerprint, because the decode never reads them.
 */
export function paramsFingerprint(
  route: AnyRoute,
  source: ParamsSource,
): string {
  return recordFingerprint(dynamicSegmentNames(route), source);
}

/**
 * Raw slice of a pages `router.query` bag for the search half (SEL4). A
 * codec-map route reads exactly its declared keys (query junk and the
 * route's own path params are invisible to the decode, PR9 disjointness); a
 * `rawSearch` route has no enumerable declared-key set — the schema sees
 * every key except the route's path params (design-06 PR5 subtraction), so
 * exactly that slice is fingerprinted, in sorted-key order for record-order
 * independence.
 */
export function queryFingerprint(route: AnyRoute, query: ParamsSource): string {
  const declared = declaredSearchKeys(route);
  if (declared !== null) return recordFingerprint(declared, query);
  const paramNames = new Set(dynamicSegmentNames(route));
  const keys = Object.keys(query)
    .filter((key) => !paramNames.has(key))
    .sort();
  return recordFingerprint(keys, query);
}
/**
 * Raw slice of an app `useSearchParams()` source (SEL4): the declared keys'
 * `[key, value]` pairs in wire order — order is load-bearing for repeated
 * keys (array codecs decode in wire order, P5/S5), and iterating the live
 * pairs preserves the relative order of declared entries while `?utm_*`
 * churn between them stays invisible. A `rawSearch` route's schema sees
 * every key (P8 does not apply there), so its slice is all pairs.
 */
export function searchParamsFingerprint(
  route: AnyRoute,
  source: URLSearchParams,
): string {
  const declared = declaredSearchKeys(route);
  const declaredSet = declared === null ? null : new Set(declared);
  const pairs: [string, string][] = [];
  for (const [key, value] of source) {
    if (declaredSet === null || declaredSet.has(key)) pairs.push([key, value]);
  }
  return JSON.stringify(pairs);
}
/**
 * The selector layer for the safe hooks (SEL2): projects the success arm and
 * reference-stabilizes the projected WRAPPER by result equality (SEL3) — a
 * stable `data` inside a fresh wrapper would still churn every consumer.
 * Error and pending arms pass through untouched; they are already
 * reference-stabilized by {@link useStableResult}'s raw-slice layer.
 */
export function useSelectedResult<T, U>(
  result: SafeResult<T>,
  options: SelectOptions<T, U> | undefined,
): SafeResult<U>;
export function useSelectedResult<T, U>(
  result: SafeResult<T> | { status: "pending" },
  options: SelectOptions<T, U> | undefined,
): SafeResult<U> | { status: "pending" };
export function useSelectedResult<T, U>(
  result: SafeResult<T> | { status: "pending" },
  options: SelectOptions<T, U> | undefined,
): SafeResult<U> | { status: "pending" } {
  const cache = useRef<null | SelectedResultCache<T, U>>(null);
  if (options === undefined) {
    // No selector: the raw-slice layer already stabilized `result`, and the
    // public overloads pin U = T for this arity.
    return result as SafeResult<U>;
  }
  if (result.status !== "success") return result;
  const previous = cache.current;
  if (previous !== null && Object.is(previous.input, result.data)) {
    // Reference-stable input ⇒ equal output by selector purity (SEL6); the
    // selector is deliberately not re-run.
    return previous.wrapped;
  }
  const selected = options.select(result.data); // a throw propagates (SEL5)
  if (
    previous !== null &&
    selectedEquals(options.equality, previous.wrapped.data, selected)
  ) {
    // Same selection out of a new decode: keep the previous wrapper (SEL2)
    // and re-key the cache so the next render takes the reference fast path.
    previous.input = result.data;
    return previous.wrapped;
  }
  const wrapped: { data: U; status: "success" } = {
    data: selected,
    status: "success",
  };
  cache.current = { input: result.data, wrapped };
  return wrapped;
}

/**
 * {@link useSelectedResult}'s twin for the `*OrThrow` hooks (SEL2): same
 * layering, no wrapper — the hook's return IS the (selected) value.
 */
export function useSelectedValue<T, U>(
  value: T,
  options: SelectOptions<T, U> | undefined,
): T | U {
  const cache = useRef<null | { input: T; selected: U }>(null);
  if (options === undefined) return value;
  const previous = cache.current;
  if (previous !== null && Object.is(previous.input, value)) {
    return previous.selected; // SEL6: selector purity, not re-run
  }
  const selected = options.select(value); // a throw propagates (SEL5)
  if (
    previous !== null &&
    selectedEquals(options.equality, previous.selected, selected)
  ) {
    previous.input = value;
    return previous.selected;
  }
  cache.current = { input: value, selected };
  return selected;
}

/**
 * The raw-slice stabilization layer (SEL4): while `route` and `fingerprint`
 * are unchanged from the previous render, the previous result — success OR
 * error arm — is returned without recomputing, so a fresh `useSearchParams()`
 * / `query` object whose DECLARED slice is unchanged (`?utm_source=` churn)
 * costs neither a decode nor anyone's referential equality. This replaces
 * the pre-design-07 "memo keyed on Next's object reference" behavior.
 */
export function useStableResult<T>(
  route: AnyRoute,
  fingerprint: string,
  compute: () => T,
): T {
  const cache = useRef<null | StableResultCache<T>>(null);
  const cached = cache.current;
  if (
    cached !== null &&
    cached.route === route &&
    cached.fingerprint === fingerprint
  ) {
    if (cached.outcome.status === "thrown") throw cached.outcome.thrown;
    return cached.outcome.value;
  }
  // Cleared BEFORE computing (SEL8): no half-computed state may survive a
  // throw, and a NEW fingerprint always recomputes — an error boundary
  // reset after the URL is fixed can never be served a stale entry.
  cache.current = null;
  try {
    const value = compute();
    cache.current = {
      fingerprint,
      outcome: { status: "value", value },
      route,
    };
    return value;
  } catch (error) {
    // Cache the throw under ITS fingerprint (see StableOutcome): update
    // renders share this ref with the committed fiber, so re-render
    // attempts while the URL stays invalid rethrow instead of re-decoding
    // (and re-emitting). A throwing MOUNT discards its work-in-progress
    // hooks, so replayed mounts still recompute — per-instance semantics,
    // same as the success arm's.
    cache.current = {
      fingerprint,
      outcome: { status: "thrown", thrown: error },
      route,
    };
    throw error;
  }
}

/**
 * Declared search keys of a route's `~search` slot, or `null` for a
 * `rawSearch` route (whose schema owns every key, so no declared subset
 * exists). The `~kind` marker is unambiguous against a codec map, which
 * never carries a top-level `~`-prefixed key (design-04 SS2).
 */
function declaredSearchKeys(route: AnyRoute): null | string[] {
  const config: unknown = route["~search"];
  if (typeof config !== "object" || config === null) return [];
  if ((config as { "~kind"?: unknown })["~kind"] === "raw-search") return null;
  return Object.keys(config);
}

/** Dynamic segment names from the define-time `~segments` token cache. */
function dynamicSegmentNames(route: AnyRoute): string[] {
  const names: string[] = [];
  for (const segment of route["~segments"]) {
    if (segment.kind !== "static") names.push(segment.name);
  }
  return names;
}

/**
 * `JSON.stringify`'d `[key, value]` slice of a record source — unambiguous
 * against concatenation collisions; absent and explicit-`undefined` keys
 * both fingerprint as `null`, matching the decode's absence semantics.
 * `Object.hasOwn` mirrors the core readers: an inherited member (a declared
 * key named `"constructor"`) is absence to the decode, so it must be absence
 * to the fingerprint too.
 */
function recordFingerprint(
  keys: readonly string[],
  source: ParamsSource,
): string {
  return JSON.stringify(
    keys.map((key) => [
      key,
      Object.hasOwn(source, key) ? (source[key] ?? null) : null,
    ]),
  );
}

/** SEL3: `Object.is`, widened one level by the `"shallow"` opt-in. */
function selectedEquals(
  equality: "shallow" | undefined,
  a: unknown,
  b: unknown,
): boolean {
  if (Object.is(a, b)) return true;
  return equality === "shallow" && shallowEqual(a, b);
}

/**
 * One-level equality for the `"shallow"` opt-in (SEL3): arrays element-wise,
 * plain objects by own enumerable keys — `Object.is` at each leaf, nothing
 * recursive (deep comparison in a render path is a non-goal, design-07).
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((element, index) => Object.is(element, b[index]))
    );
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  return (
    aKeys.length === Object.keys(bRecord).length &&
    aKeys.every(
      (key) =>
        Object.hasOwn(bRecord, key) && Object.is(aRecord[key], bRecord[key]),
    )
  );
}
