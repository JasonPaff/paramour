// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { defineRoute, p, ParamsDecodeError, SearchDecodeError } from "paramour";
import { describe, expect, it } from "vitest";

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
});
