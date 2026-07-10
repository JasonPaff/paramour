// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import {
  defineAppRoute,
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
} from "../src/app.js";
import { __setParams, __setSearchParams } from "./stubs/next-navigation.js";

const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const filesRoute = defineAppRoute("/files/[...slug]", {
  params: { slug: p.string() },
});

const docsRoute = defineAppRoute("/docs/[[...path]]", {
  params: { path: p.string() },
});

const rawRoute = defineAppRoute("/raw", {
  search: rawSearch(
    z.object({ page: z.coerce.number().optional(), q: z.string() }),
  ),
});

describe("useSearch (smoke: useMemo ↔ useSearchParams wiring)", () => {
  it("returns the success arm for a valid search string", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current).toEqual({
      data: { page: 2, q: "hi" },
      status: "success",
    });
  });

  it("returns the error arm for a malformed search string", () => {
    __setSearchParams(new URLSearchParams("page=abc"));
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });
});

describe("useRouteParams (smoke: useMemo ↔ useParams wiring)", () => {
  it("returns the success arm for a valid params object", () => {
    __setParams({ id: "42" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current).toEqual({ data: { id: 42 }, status: "success" });
  });

  it("returns the error arm for a malformed params object", () => {
    __setParams({ id: "nope" });
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(ParamsDecodeError);
  });
});

describe("useParams() null outside an App-Router tree (hybrid pages render)", () => {
  it("useRouteParams degrades null to a SafeResult error, not a crash", () => {
    __setParams(null);
    const { result } = renderHook(() => useRouteParams(productRoute));
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    // A null context reads as every-param-missing, the documented error class.
    expect(result.current.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("useRouteParamsOrThrow throws the documented ParamsDecodeError on null", () => {
    __setParams(null);
    expect(() => renderHook(() => useRouteParamsOrThrow(productRoute))).toThrow(
      ParamsDecodeError,
    );
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

  it("useRouteParams returns the identical result object across rerenders with the same params", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("useRouteParams recomputes when a NEW params object with identical content arrives", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    __setParams({ id: "42" });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });

  it("useRouteParamsOrThrow returns the identical decoded object across rerenders with the same params", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() =>
      useRouteParamsOrThrow(productRoute),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("useRouteParamsOrThrow recomputes when a NEW params object with identical content arrives", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() =>
      useRouteParamsOrThrow(productRoute),
    );
    const first = result.current;
    __setParams({ id: "42" });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });

  it("useSearchOrThrow returns the identical decoded object across rerenders with the same URLSearchParams", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { rerender, result } = renderHook(() =>
      useSearchOrThrow(productRoute),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("useSearchOrThrow recomputes when a NEW URLSearchParams with identical text arrives", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { rerender, result } = renderHook(() =>
      useSearchOrThrow(productRoute),
    );
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });
});

describe("catch-all params through useRouteParams", () => {
  it("decodes an array-valued catch-all segment", () => {
    __setParams({ slug: ["a", "b"] });
    const { result } = renderHook(() => useRouteParams(filesRoute));
    expect(result.current).toEqual({
      data: { slug: ["a", "b"] },
      status: "success",
    });
  });
});

describe("optional catch-all params through useRouteParams", () => {
  it("an absent [[...path]] key normalizes to [] (D6)", () => {
    __setParams({});
    const { result } = renderHook(() => useRouteParams(docsRoute));
    expect(result.current).toEqual({
      data: { path: [] },
      status: "success",
    });
  });

  it("a present [[...path]] decodes element-wise like a catch-all", () => {
    __setParams({ path: ["a", "b"] });
    const { result } = renderHook(() => useRouteParams(docsRoute));
    expect(result.current).toEqual({
      data: { path: ["a", "b"] },
      status: "success",
    });
  });
});

describe("params arrive percent-ENCODED from useParams (R5, core owns the decode)", () => {
  // The pages twin pins the opposite direction (percentDecode: false, no
  // double-decode); this pins that app.ts keeps decodeParams's DEFAULT — a
  // symmetric `{ percentDecode: false }` here would break these, not the
  // rest of the suite.
  it("decodes a %20-bearing single param before the codec grammar", () => {
    const slugRoute = defineAppRoute("/product/[slug]", {
      params: { slug: p.string() },
    });
    __setParams({ slug: "a%20b" });
    const { result } = renderHook(() => useRouteParams(slugRoute));
    expect(result.current).toEqual({
      data: { slug: "a b" },
      status: "success",
    });
  });

  it("decodes catch-all elements independently, restoring %2F to a slash (R2)", () => {
    __setParams({ slug: ["a%2Fb", "c"] });
    const { result } = renderHook(() => useRouteParams(filesRoute));
    expect(result.current).toEqual({
      data: { slug: ["a/b", "c"] },
      status: "success",
    });
  });
});

describe("rawSearch routes through the search hooks", () => {
  it("useSearch returns the success arm holding the schema's output", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearch(rawRoute));
    expect(result.current).toEqual({
      data: { page: 2, q: "hi" },
      status: "success",
    });
  });

  it("useSearchOrThrow returns the schema's output directly", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() => useSearchOrThrow(rawRoute));
    expect(result.current).toEqual({ page: 2, q: "hi" });
  });

  it("useSearch surfaces a foreign (zod) failure as the SearchDecodeError arm", () => {
    // Required `q` is absent, so the zod schema rejects — the foreign error
    // must reach the hook wiring already branded as SearchDecodeError.
    __setSearchParams(new URLSearchParams("page=2"));
    const { result } = renderHook(() => useSearch(rawRoute));
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });

  it("useSearchOrThrow throws the branded SearchDecodeError on a foreign failure", () => {
    __setSearchParams(new URLSearchParams("page=2"));
    expect(() => renderHook(() => useSearchOrThrow(rawRoute))).toThrow(
      SearchDecodeError,
    );
  });
});

describe("defaults and absent optionals decode through the search hooks", () => {
  it("useSearch fills the default and omits the absent optional on empty search", () => {
    __setSearchParams(new URLSearchParams());
    const { result } = renderHook(() => useSearch(productRoute));
    expect(result.current).toEqual({ data: { page: 1 }, status: "success" });
  });

  it("useSearchOrThrow returns the default-filled object on empty search", () => {
    __setSearchParams(new URLSearchParams());
    const { result } = renderHook(() => useSearchOrThrow(productRoute));
    expect(result.current).toEqual({ page: 1 });
  });
});
