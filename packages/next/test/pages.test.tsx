// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import {
  definePagesRoute,
  p,
  ParamourError,
  ParamsDecodeError,
  rawSearch,
  SearchDecodeError,
} from "paramour";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { useRouteParams, useSearch } from "../src/pages.js";
import { __setIsReady, __setMounted, __setQuery } from "./stubs/next-router.js";

const productRoute = definePagesRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const filesRoute = definePagesRoute("/files/[...slug]", {
  params: { slug: p.string() },
});

const tagsRoute = definePagesRoute("/tags", {
  search: { tag: p.stringArray() },
});

// A STRICT raw schema: any undeclared key fails the decode. The subtraction
// tests lean on this — with `id` left in the bag, decoding would error, so a
// success arm proves the path param was subtracted before the schema ran.
const strictRoute = definePagesRoute("/strict/[id]", {
  params: { id: p.integer() },
  search: rawSearch(z.strictObject({ q: z.string() })),
});

beforeEach(() => {
  __setIsReady(true);
  __setMounted(true);
  __setQuery({});
});

describe("three-state RouterResult (PR5): pending until isReady", () => {
  it("useRouteParams: pending pre-isReady, success after the flip", () => {
    __setIsReady(false);
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current).toEqual({ status: "pending" });
    __setIsReady(true);
    __setQuery({ id: "42" });
    rerender();
    expect(result.current).toEqual({ data: { id: 42 }, status: "success" });
  });

  it("useSearch: pending pre-isReady, success after the flip", () => {
    __setIsReady(false);
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    expect(result.current).toEqual({ status: "pending" });
    __setIsReady(true);
    __setQuery({ id: "42", page: "2", q: "hi" });
    rerender();
    expect(result.current).toEqual({
      data: { page: 2, q: "hi" },
      status: "success",
    });
  });

  it("pending is decoded from NOTHING: a populated pre-isReady query is ignored", () => {
    // Statically-optimized pages hand back `{}` pre-isReady, but the hook
    // must key on isReady, not on query looking usable.
    __setIsReady(false);
    __setQuery({ id: "42" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current).toEqual({ status: "pending" });
  });
});

describe("useSearch subtracts the route's path params from router.query (PR5)", () => {
  it("a strict raw schema succeeds because `id` never reaches it", () => {
    __setQuery({ id: "7", q: "hi" });
    const { result } = renderHook(() => useSearch(strictRoute));
    expect(result.current).toEqual({ data: { q: "hi" }, status: "success" });
  });

  it("declared search keys decode from the merged bag; the param key is invisible", () => {
    __setQuery({ id: "42", page: "2" });
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current).toEqual({
      data: { page: 2 },
      status: "success",
    });
  });

  it("useRouteParams reads the SAME merged bag for the param half", () => {
    __setQuery({ id: "42", page: "2" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current).toEqual({ data: { id: 42 }, status: "success" });
  });
});

describe("query value shapes (PR11 §4)", () => {
  it("catch-all param arrives as string[]", () => {
    __setQuery({ slug: ["a", "b"] });
    const { result } = renderHook(() => useRouteParams(filesRoute));
    expect(result.current).toEqual({
      data: { slug: ["a", "b"] },
      status: "success",
    });
  });

  it("repeated query key (?tag=x&tag=y) decodes as an array", () => {
    // next/router parses repeats into an array before we ever see them.
    __setQuery({ tag: ["x", "y"] });
    const { result } = renderHook(() => useSearch(tagsRoute));
    expect(result.current).toEqual({
      data: { tag: ["x", "y"] },
      status: "success",
    });
  });
});

describe("decode failure is the error arm, never a throw (PR5/PR6)", () => {
  it("useRouteParams: malformed param", () => {
    __setQuery({ id: "nope" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("useSearch: malformed search value", () => {
    __setQuery({ id: "1", page: "abc" });
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });
});

describe("unmounted next/router (App Router placement, PR5)", () => {
  it("useRouteParams rethrows a ParamourError naming the /app-vs-/pages mistake", () => {
    __setMounted(false);
    expect(() => renderHook(() => useRouteParams(productRoute))).toThrow(
      ParamourError,
    );
    expect(() => renderHook(() => useRouteParams(productRoute))).toThrow(
      /@paramour-js\/next\/app/,
    );
  });

  it("useSearch rethrows the same translation", () => {
    __setMounted(false);
    expect(() => renderHook(() => useSearch(productRoute))).toThrow(
      /App Router/,
    );
  });
});

describe("memoization is keyed on router.query + router.isReady", () => {
  it("returns the identical result object across rerenders with the same query", () => {
    const query = { id: "42" };
    __setQuery(query);
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("recomputes when a NEW query object with identical text arrives", () => {
    __setQuery({ id: "42" });
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    __setQuery({ id: "42" });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });

  it("pending results share one referentially stable object across hooks", () => {
    __setIsReady(false);
    const params = renderHook(() => useRouteParams(productRoute));
    const search = renderHook(() => useSearch(productRoute));
    expect(params.result.current).toBe(search.result.current);
  });
});
