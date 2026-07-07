// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import {
  defineRoute,
  p,
  ParamsDecodeError,
  rawSearch,
  SearchDecodeError,
} from "paramour";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  useRouteParams,
  useRouteParamsOrThrow,
  useSearch,
  useSearchOrThrow,
} from "../src/client.js";
import { __setParams, __setSearchParams } from "./stubs/next-navigation.js";

const productRoute = defineRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const filesRoute = defineRoute("/files/[...slug]", {
  params: { slug: p.string() },
});

const rawRoute = defineRoute("/raw", {
  search: rawSearch(
    z.object({ page: z.coerce.number().optional(), q: z.string() }),
  ),
});

describe("useSearch (smoke: useMemo ↔ useSearchParams wiring)", () => {
  it("returns { data } for a valid search string", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current).toEqual({ data: { page: 2, q: "hi" } });
  });

  it("returns { error } for a malformed search string", () => {
    __setSearchParams(new URLSearchParams("page=abc"));
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });
});

describe("useRouteParams (smoke: useMemo ↔ useParams wiring)", () => {
  it("returns { data } for a valid params object", () => {
    __setParams({ id: "42" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current).toEqual({ data: { id: 42 } });
  });

  it("returns { error } for a malformed params object", () => {
    __setParams({ id: "nope" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current.error).toBeInstanceOf(ParamsDecodeError);
  });
});

describe("*OrThrow variants throw to the error boundary", () => {
  it("useSearchOrThrow throws on a malformed URL", () => {
    __setSearchParams(new URLSearchParams("page=abc"));
    expect(() => renderHook(() => useSearchOrThrow(productRoute))).toThrow(
      SearchDecodeError,
    );
  });

  it("useRouteParamsOrThrow throws on a malformed URL", () => {
    __setParams({ id: "nope" });
    expect(() => renderHook(() => useRouteParamsOrThrow(productRoute))).toThrow(
      ParamsDecodeError,
    );
  });

  it("useSearchOrThrow returns the decoded output directly on a valid URL", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearchOrThrow(productRoute));
    expect(result.current).toEqual({ page: 2, q: "hi" });
  });

  it("useRouteParamsOrThrow returns the decoded params directly on a valid URL", () => {
    __setParams({ id: "42" });
    const { result } = renderHook(() => useRouteParamsOrThrow(productRoute));
    expect(result.current).toEqual({ id: 42 });
  });
});

describe("memoization is keyed on the Next hook's reference", () => {
  it("returns the identical result object across rerenders with the same URLSearchParams", () => {
    __setSearchParams(new URLSearchParams("page=2"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("recomputes when a NEW URLSearchParams with identical text arrives", () => {
    __setSearchParams(new URLSearchParams("page=2"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2"));
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });
});

describe("catch-all params through useRouteParams", () => {
  it("decodes an array-valued catch-all segment", () => {
    __setParams({ slug: ["a", "b"] });
    const { result } = renderHook(() => useRouteParams(filesRoute));
    expect(result.current).toEqual({ data: { slug: ["a", "b"] } });
  });
});

describe("rawSearch routes through the search hooks", () => {
  it("useSearch returns { data } holding the schema's output", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearch(rawRoute));
    expect(result.current).toEqual({ data: { page: 2, q: "hi" } });
  });

  it("useSearchOrThrow returns the schema's output directly", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearchOrThrow(rawRoute));
    expect(result.current).toEqual({ page: 2, q: "hi" });
  });
});
