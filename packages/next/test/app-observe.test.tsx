// @vitest-environment happy-dom
/**
 * Emission behavior of the App-Router hooks (design-12 DT4/DT6/DT12): one
 * observation per decode CHANGE (the fingerprint cache miss), none on a
 * same-fingerprint re-render or StrictMode's dev double render, error
 * observations reported BEFORE the OrThrow rethrow, full pre-`select`
 * payloads, a working `navigate`, and the production no-emit guard.
 */
import type { ReactNode } from "react";

import { renderHook } from "@testing-library/react";
import { defineAppRoute, p, SearchDecodeError } from "paramour";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamourObservation } from "../src/devtools-seam.js";
import type { ParamourTestingOptions } from "../src/testing.js";

import {
  useRouteParams,
  useRouteParamsOrThrow,
  useSearch,
  useSearchOrThrow,
} from "../src/app.js";
import { getParamourSeam } from "../src/devtools-seam.js";
import { useStableResult } from "../src/select.js";
import { ParamourTestingProvider } from "../src/testing.js";

const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

function buffer(): readonly ParamourObservation[] {
  return getParamourSeam().buffer;
}

// TA7 dogfooding: URL state and replace-capture are provider props, not a
// framework-hook module mock. Mid-test reassignments of `current` take
// effect on the next rerender() through the provider's stable adapter
// pair (TA4).
let current: ParamourTestingOptions = {};
let replaceCalls: string[] = [];

const wrapper = ({ children }: { children: ReactNode }) => (
  <ParamourTestingProvider {...current}>{children}</ParamourTestingProvider>
);

// The provider sits INSIDE StrictMode so its own adapters live under the
// dev double render exactly like a consumer's would.
const strictModeWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <ParamourTestingProvider {...current}>{children}</ParamourTestingProvider>
  </StrictMode>
);

beforeEach(() => {
  const seam = getParamourSeam();
  seam.buffer.length = 0;
  seam.listeners.clear();
  replaceCalls = [];
  current = {
    onReplace: (href) => {
      replaceCalls.push(href);
    },
    params: { id: "42" },
    pathname: "/product/42",
    search: new URLSearchParams("page=2&q=hi"),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("one observation per decode change (DT4)", () => {
  it("emits exactly once on mount with the full payload", () => {
    const { result } = renderHook(() => useSearch(productRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    const observation = buffer()[0];
    expect(observation?.hook).toBe("app.useSearch");
    expect(observation?.kind).toBe("search");
    expect(observation?.routerKind).toBe("app");
    expect(observation?.route).toBe(productRoute);
    expect(observation?.wire).toEqual([
      ["page", "2"],
      ["q", "hi"],
    ]);
    // The observation's result IS the hook's returned result (same object).
    expect(observation?.result).toBe(result.current);
  });

  it("does not emit on a same-fingerprint re-render", () => {
    const { rerender } = renderHook(() => useSearch(productRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    rerender();
    rerender();
    expect(buffer()).toHaveLength(1);
  });

  it("emits exactly one more when the declared slice changes", () => {
    const { rerender } = renderHook(() => useSearch(productRoute), { wrapper });
    current = { ...current, search: new URLSearchParams("page=3&q=hi") };
    rerender();
    expect(buffer()).toHaveLength(2);
    expect(buffer()[1]?.wire).toEqual([
      ["page", "3"],
      ["q", "hi"],
    ]);
  });

  it("emits exactly once under StrictMode's dev double render", () => {
    renderHook(() => useSearch(productRoute), { wrapper: strictModeWrapper });
    expect(buffer()).toHaveLength(1);
  });

  it("params hooks emit a decode-time copy of the params record", () => {
    renderHook(() => useRouteParams(productRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    const observation = buffer()[0];
    expect(observation?.hook).toBe("app.useRouteParams");
    expect(observation?.kind).toBe("params");
    expect(observation?.wire).toEqual({ id: "42" });
  });
});

describe("OrThrow hooks report before throwing (DT4)", () => {
  it("emits the error observation carrying the LIVE error, then rethrows", () => {
    current = { ...current, search: new URLSearchParams("page=abc") };
    let thrown: unknown;
    try {
      renderHook(() => useSearchOrThrow(productRoute), { wrapper });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SearchDecodeError);
    // React's dev behavior replays a throwing MOUNT (to build the error's
    // component stack), and a mount that throws discards its work-in-
    // progress hooks — the SEL8 thrown-outcome cache cannot survive it, so
    // the replay re-emits. Pinned here rather than papered over; UPDATE
    // renders do keep the cache and emit once (see the re-render test
    // below). Every emission is the error observation, and the LAST one
    // carries the error instance React ultimately rethrew.
    expect(buffer().length).toBeGreaterThanOrEqual(1);
    for (const observation of buffer()) {
      expect(observation.hook).toBe("app.useSearchOrThrow");
      expect(observation.result.status).toBe("error");
    }
    const last = buffer().at(-1);
    if (last?.result.status !== "error") return;
    expect(last.result.error).toBe(thrown);
  });

  it("emits a success observation when the decode succeeds", () => {
    renderHook(() => useRouteParamsOrThrow(productRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    const observation = buffer()[0];
    expect(observation?.hook).toBe("app.useRouteParamsOrThrow");
    expect(observation?.result).toEqual({
      data: { id: 42 },
      status: "success",
    });
  });

  it("a persisting decode error is served from cache, not recomputed per re-render", () => {
    // A mounted page whose URL turns invalid: the thrown outcome must be
    // cached under its fingerprint like a success is (SEL8), or every
    // re-render is a cache miss that re-runs the decode — and since the
    // OrThrow hooks emit INSIDE the compute, each rerun re-emits a
    // duplicate error observation until the 128-entry buffer is all
    // duplicates. `useStableResult` is the compute's dedup layer, so its
    // single-compute guarantee IS the single-emit guarantee (DT4). The
    // harness catches inside render (an error boundary would remount and
    // reset the per-instance ref cache) and drives useStableResult
    // directly — catching around the full hook would skip the selector
    // hook's slot and trip React's hook-count invariant.
    let computeCount = 0;
    const { rerender, result } = renderHook(
      () => {
        try {
          return useStableResult(productRoute, "same-invalid-url", () => {
            computeCount += 1;
            throw new Error("boom");
          });
        } catch (error) {
          return error;
        }
      },
      { wrapper },
    );
    expect(computeCount).toBe(1);
    const firstThrown = result.current;
    expect(firstThrown).toBeInstanceOf(Error);

    rerender();
    rerender();
    expect(computeCount).toBe(1);
    // The SAME instance rethrows — an error boundary reset under the same
    // URL sees a stable error, and no new observation was emitted.
    expect(result.current).toBe(firstThrown);
  });
});

describe("observations are pre-select (DT12)", () => {
  it("carries the full decoded result, not the projection", () => {
    const { result } = renderHook(
      () => useSearch(productRoute, { select: (search) => search.page }),
      { wrapper },
    );
    expect(result.current).toEqual({ data: 2, status: "success" });
    const observation = buffer()[0];
    expect(observation?.result).toEqual({
      data: { page: 2, q: "hi" },
      status: "success",
    });
  });
});

describe("navigate capability (DT8)", () => {
  it("resolves the panel's search-only string against the hook's own pathname", () => {
    // The panel sends ONLY the serialized search string: `usePathname()` is
    // basePath-/locale-relative, so the hook-side join is what keeps a
    // configured basePath from doubling through router.replace.
    renderHook(() => useSearch(productRoute), { wrapper });
    buffer()[0]?.navigate("?page=9");
    expect(replaceCalls).toEqual(["/product/42?page=9"]);
  });

  it("observations carry the hook's basePath-relative pathname", () => {
    renderHook(() => useSearch(productRoute), { wrapper });
    expect(buffer()[0]?.pathname).toBe("/product/42");
  });
});

describe("pathname re-emission (DT8)", () => {
  it("re-emits with a fresh navigate when the pathname moves under an unchanged decode", () => {
    // A layout-surviving component on /product/42?q=… → /product/43?q=…:
    // the declared search slice is unchanged, so the decode cache hits and
    // the SEL4 layer stays silent — but the previously emitted navigate is
    // bound to /product/42. Committing an edit through it would silently
    // navigate BACK to the old resource, so the seam must re-emit with the
    // new resolution base.
    const { rerender } = renderHook(() => useSearch(productRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    current = { ...current, pathname: "/product/43" };
    rerender();
    expect(buffer()).toHaveLength(2);
    expect(buffer()[1]?.pathname).toBe("/product/43");
    // The decode itself was NOT recomputed: the re-emission carries the
    // cached result by identity (SEL4 stability is untouched).
    expect(buffer()[1]?.result).toBe(buffer()[0]?.result);
    buffer()[1]?.navigate("?page=9");
    expect(replaceCalls).toEqual(["/product/43?page=9"]);
  });

  it("does not re-emit while the pathname holds still", () => {
    const { rerender } = renderHook(() => useSearch(productRoute), { wrapper });
    rerender();
    rerender();
    expect(buffer()).toHaveLength(1);
  });
});

describe("production guard (DT6)", () => {
  it("safe hooks decode normally and emit nothing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { result } = renderHook(() => useSearch(productRoute), { wrapper });
    expect(result.current).toEqual({
      data: { page: 2, q: "hi" },
      status: "success",
    });
    expect(buffer()).toHaveLength(0);
  });

  it("OrThrow hooks take the prod early-return branch and emit nothing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { result } = renderHook(() => useSearchOrThrow(productRoute), {
      wrapper,
    });
    expect(result.current).toEqual({ page: 2, q: "hi" });
    expect(buffer()).toHaveLength(0);
  });
});
