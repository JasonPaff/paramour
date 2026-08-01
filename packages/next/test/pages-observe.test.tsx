// @vitest-environment happy-dom
/**
 * Emission behavior of the Pages-Router hooks: the pre-`isReady` render
 * reports `pending` as a first-class observation (keyed by
 * PENDING_FINGERPRINT, so exactly once), the ready flip emits the real
 * decode, wire snapshots expand repeated keys and exclude path params on the
 * search side, and `navigate` swallows next/router's routine
 * navigation-abort rejections.
 */
import type { ReactElement, ReactNode } from "react";

import { renderHook } from "@testing-library/react";
import { definePagesRoute, p } from "paramour";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamourObservation } from "../src/devtools-seam.js";
import type { PagesNavigationAdapter } from "../src/navigation-adapter.js";
import type { ParamourTestingOptions } from "../src/testing.js";

import { getParamourSeam } from "../src/devtools-seam.js";
import { PagesNavigationContext } from "../src/navigation-adapter.js";
import { useRouteParams, useSearch } from "../src/pages.js";
import { ParamourTestingProvider } from "../src/testing.js";

const userRoute = definePagesRoute("/user/[id]", {
  params: { id: p.integer() },
  search: {
    tab: p.string().optional(),
    tag: p.array(),
  },
});

// The stub-era `__set*` choreography is now ordinary provider props:
// `__setAsPath` splits into pathname + search (asPath derives from them),
// `__setQuery`'s path-param keys go in `params` and the rest in `search`,
// `__getReplaceCalls` becomes an `onReplace` capture array. Mid-test URL
// changes reassign `current` and rerender.
let current: ParamourTestingOptions = {};
let replaceCalls: string[] = [];

const wrapper = ({ children }: { children: ReactNode }) => (
  <ParamourTestingProvider {...current}>{children}</ParamourTestingProvider>
);

function buffer(): readonly ParamourObservation[] {
  return getParamourSeam().buffer;
}

/** The stub-era baseline (/user/7?tab=posts with path param id=7) as props. */
function options(
  overrides: ParamourTestingOptions = {},
): ParamourTestingOptions {
  return {
    onReplace: (href) => {
      replaceCalls.push(href);
    },
    params: { id: "7" },
    pathname: "/user/7",
    search: "tab=posts",
    ...overrides,
  };
}

beforeEach(() => {
  const seam = getParamourSeam();
  seam.buffer.length = 0;
  seam.listeners.clear();
  current = options();
  replaceCalls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pending is a first-class observation", () => {
  it("emits pending exactly once pre-isReady, then the decode on flip", () => {
    current = options({ isReady: false, params: {}, search: "" });
    const { rerender } = renderHook(() => useSearch(userRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    expect(buffer()[0]?.result).toEqual({ status: "pending" });
    expect(buffer()[0]?.wire).toEqual([]);

    // Same pending fingerprint — no re-emit.
    rerender();
    expect(buffer()).toHaveLength(1);

    current = options();
    rerender();
    expect(buffer()).toHaveLength(2);
    const observation = buffer()[1];
    expect(observation?.hook).toBe("pages.useSearch");
    expect(observation?.routerKind).toBe("pages");
    expect(observation?.result.status).toBe("success");
  });
});

describe("wire snapshots", () => {
  it("search wire expands repeated keys in order and excludes path params", () => {
    current = options({ search: "tag=a&tag=b" });
    renderHook(() => useSearch(userRoute), { wrapper });
    const observation = buffer()[0];
    expect(observation?.kind).toBe("search");
    // `id` is the route's own path param — subtracted before decode, so the
    // observation reflects what the decoder actually saw.
    expect(observation?.wire).toEqual([
      ["tag", "a"],
      ["tag", "b"],
    ]);
  });

  it("params wire is a copy of the full merged query", () => {
    // The baseline already merges ?tab=posts with the id path param — the
    // stub-era `__setQuery({ id, tab })` bag.
    renderHook(() => useRouteParams(userRoute), { wrapper });
    const observation = buffer()[0];
    expect(observation?.hook).toBe("pages.useRouteParams");
    expect(observation?.kind).toBe("params");
    expect(observation?.wire).toEqual({ id: "7", tab: "posts" });
  });
});

// The public provider's `replace` always RESOLVES `true`; rejection
// injection pins pages.ts's rejection handling, so those tests bypass the
// provider and render a hand-built adapter through the internal seam.
function rejectingWrapper(
  rejection: Error,
): (props: { children: ReactNode }) => ReactElement {
  const adapter: PagesNavigationAdapter = {
    useRouter: () => ({
      asPath: "/user/7?tab=posts",
      isReady: true,
      query: { id: "7" },
      replace(url: string): Promise<boolean> {
        replaceCalls.push(url);
        return Promise.reject(rejection);
      },
    }),
  };
  return function RejectingWrapper({ children }) {
    return (
      <PagesNavigationContext.Provider value={adapter}>
        {children}
      </PagesNavigationContext.Provider>
    );
  };
}

describe("navigate capability", () => {
  it("resolves the panel's search-only string against asPath's path part", () => {
    // `asPath` (derived from pathname + search) is basePath-/locale-relative
    // — exactly what replace() expects back — and its query/hash are
    // stripped before the panel's search string is appended.
    renderHook(() => useRouteParams(userRoute), { wrapper });
    buffer()[0]?.navigate("?tab=likes");
    expect(replaceCalls).toEqual(["/user/7?tab=likes"]);
  });

  it("a rejecting replace does not surface an unhandled rejection", async () => {
    // next/router's replace rejects on routine navigation aborts, marking
    // the error `cancelled` (its internal abort discriminant).
    const abort = Object.assign(new Error("Route Cancelled"), {
      cancelled: true,
    });
    renderHook(() => useRouteParams(userRoute), {
      wrapper: rejectingWrapper(abort),
    });
    buffer()[0]?.navigate("");
    // Let the rejection settle; vitest fails the test on any unhandled
    // rejection, so reaching the assertion IS the assertion.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replaceCalls).toEqual(["/user/7"]);
  });

  it("swallows CANCELLED aborts silently (routine rapid re-commits)", async () => {
    const abort = Object.assign(new Error("Route Cancelled"), {
      cancelled: true,
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderHook(() => useRouteParams(userRoute), {
      wrapper: rejectingWrapper(abort),
    });
    buffer()[0]?.navigate("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("surfaces a NON-cancelled replace failure to the console", async () => {
    // Next marks genuine aborts with `err.cancelled`; anything else is a
    // real failure (render error, route-info error) — silently discarding
    // it makes a panel edit appear to no-op with no signal at all.
    const failure = new Error("render blew up");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderHook(() => useRouteParams(userRoute), {
      wrapper: rejectingWrapper(failure),
    });
    buffer()[0]?.navigate("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).toHaveBeenCalledWith(failure);
  });
});

describe("pathname re-emission", () => {
  it("re-emits with a fresh navigate when asPath's path part moves under an unchanged declared slice", () => {
    const { rerender } = renderHook(() => useSearch(userRoute), { wrapper });
    expect(buffer()).toHaveLength(1);
    expect(buffer()[0]?.pathname).toBe("/user/7");
    // Navigate to /user/8 where the declared search keys (tab/tag) are
    // unchanged: the fingerprint excludes the path param, so no decode
    // change — but the resolution base moved.
    current = options({ params: { id: "8" }, pathname: "/user/8" });
    rerender();
    expect(buffer()).toHaveLength(2);
    expect(buffer()[1]?.pathname).toBe("/user/8");
    buffer()[1]?.navigate("?tab=likes");
    expect(replaceCalls).toEqual(["/user/8?tab=likes"]);
  });
});
