// @vitest-environment happy-dom
/**
 * Emission behavior of the Pages-Router hooks (design-12 DT4/DT11): the
 * pre-`isReady` render reports `pending` as a first-class observation
 * (keyed by PENDING_FINGERPRINT, so exactly once), the ready flip emits the
 * real decode, wire snapshots expand repeated keys and exclude path params
 * on the search side, and `navigate` swallows next/router's routine
 * navigation-abort rejections.
 */
import { renderHook } from "@testing-library/react";
import { definePagesRoute, p } from "paramour";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamourObservation } from "../src/devtools-seam.js";

import { getParamourSeam } from "../src/devtools-seam.js";
import { useRouteParams, useSearch } from "../src/pages.js";
import {
  __getReplaceCalls,
  __resetReplaceCalls,
  __setAsPath,
  __setIsReady,
  __setQuery,
  __setReplaceRejects,
  __setReplaceRejectsWith,
} from "./stubs/next-router.js";

const userRoute = definePagesRoute("/user/[id]", {
  params: { id: p.integer() },
  search: {
    tab: p.string().optional(),
    tag: p.stringArray(),
  },
});

function buffer(): readonly ParamourObservation[] {
  return getParamourSeam().buffer;
}

beforeEach(() => {
  const seam = getParamourSeam();
  seam.buffer.length = 0;
  seam.listeners.clear();
  __resetReplaceCalls();
  __setAsPath("/user/7?tab=posts");
  __setIsReady(true);
  __setQuery({ id: "7" });
  __setReplaceRejects(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pending is a first-class observation (DT11)", () => {
  it("emits pending exactly once pre-isReady, then the decode on flip", () => {
    __setIsReady(false);
    __setQuery({});
    const { rerender } = renderHook(() => useSearch(userRoute));
    expect(buffer()).toHaveLength(1);
    expect(buffer()[0]?.result).toEqual({ status: "pending" });
    expect(buffer()[0]?.wire).toEqual([]);

    // Same pending fingerprint — no re-emit.
    rerender();
    expect(buffer()).toHaveLength(1);

    __setIsReady(true);
    __setQuery({ id: "7", tab: "posts" });
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
    __setQuery({ id: "7", tag: ["a", "b"] });
    renderHook(() => useSearch(userRoute));
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
    __setQuery({ id: "7", tab: "posts" });
    renderHook(() => useRouteParams(userRoute));
    const observation = buffer()[0];
    expect(observation?.hook).toBe("pages.useRouteParams");
    expect(observation?.kind).toBe("params");
    expect(observation?.wire).toEqual({ id: "7", tab: "posts" });
  });
});

describe("navigate capability (DT8)", () => {
  it("resolves the panel's search-only string against asPath's path part", () => {
    // `asPath` is basePath-/locale-relative — exactly what replace()
    // expects back — and its query/hash are stripped before the panel's
    // search string is appended.
    renderHook(() => useRouteParams(userRoute));
    buffer()[0]?.navigate("?tab=likes");
    expect(__getReplaceCalls()).toEqual(["/user/7?tab=likes"]);
  });

  it("a rejecting replace does not surface an unhandled rejection", async () => {
    __setReplaceRejects(true);
    renderHook(() => useRouteParams(userRoute));
    buffer()[0]?.navigate("");
    // Let the rejection settle; vitest fails the test on any unhandled
    // rejection, so reaching the assertion IS the assertion.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(__getReplaceCalls()).toEqual(["/user/7"]);
  });

  it("swallows CANCELLED aborts silently (routine rapid re-commits)", async () => {
    __setReplaceRejects(true);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderHook(() => useRouteParams(userRoute));
    buffer()[0]?.navigate("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("surfaces a NON-cancelled replace failure to the console", async () => {
    // Next marks genuine aborts with `err.cancelled`; anything else is a
    // real failure (render error, route-info error) — silently discarding
    // it makes a panel edit appear to no-op with no signal at all.
    const failure = new Error("render blew up");
    __setReplaceRejectsWith(failure);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderHook(() => useRouteParams(userRoute));
    buffer()[0]?.navigate("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).toHaveBeenCalledWith(failure);
  });
});

describe("pathname re-emission (DT8)", () => {
  it("re-emits with a fresh navigate when asPath's path part moves under an unchanged declared slice", () => {
    __setQuery({ id: "7", tab: "posts" });
    const { rerender } = renderHook(() => useSearch(userRoute));
    expect(buffer()).toHaveLength(1);
    expect(buffer()[0]?.pathname).toBe("/user/7");
    // Navigate to /user/8 where the declared search keys (tab/tag) are
    // unchanged: the fingerprint excludes the path param, so no decode
    // change — but the resolution base moved.
    __setAsPath("/user/8?tab=posts");
    __setQuery({ id: "8", tab: "posts" });
    rerender();
    expect(buffer()).toHaveLength(2);
    expect(buffer()[1]?.pathname).toBe("/user/8");
    buffer()[1]?.navigate("?tab=likes");
    expect(__getReplaceCalls()).toEqual(["/user/8?tab=likes"]);
  });
});
