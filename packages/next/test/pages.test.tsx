// @vitest-environment happy-dom
import type { StandardSchemaV1 } from "@standard-schema/spec";

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
import {
  __setIsReady,
  __setMounted,
  __setQuery,
  __setThrow,
} from "./stubs/next-router.js";

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

const docsRoute = definePagesRoute("/docs/[[...path]]", {
  params: { path: p.string() },
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
  __setThrow(undefined);
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

  it("a hostile __proto__ key survives the subtraction as an ordinary own property", () => {
    // JSON.parse (unlike an object literal) makes "__proto__" an ordinary own
    // key, as Node's querystring layer does for `?__proto__=`. zod silently
    // drops the key (its own pollution guard), so a spy schema captures the
    // exact bag the hook hands over: had omitPathParams rebuilt it with SET
    // semantics, the array value would have swapped the bag's prototype and
    // vanished as data; define semantics keep it an ordinary own key.
    let seen: Record<string, string | string[]> | undefined;
    const spy: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: (value) => {
          seen = value as Record<string, string | string[]>;
          return { value };
        },
        vendor: "test",
        version: 1,
      },
    };
    const spyRoute = definePagesRoute("/spy/[id]", {
      params: { id: p.integer() },
      search: rawSearch(spy),
    });
    __setQuery(
      JSON.parse('{"__proto__": ["polluted"], "id": "7"}') as Record<
        string,
        string | string[]
      >,
    );
    const { result } = renderHook(() => useSearch(spyRoute));
    expect(result.current.status).toBe("success");
    // The single-element array collapses to a scalar in core's normalization;
    // the key itself must arrive as an own enumerable property, with the
    // bag's prototype untouched.
    expect(Object.entries(seen ?? {})).toEqual([["__proto__", "polluted"]]);
    expect(Reflect.getPrototypeOf(seen ?? {})).toBe(Object.prototype);
  });
});

describe("query values arrive already percent-decoded (R5, no double-decode)", () => {
  it("a %20-bearing param survives as the literal string next/router hands back", () => {
    // next/router has already decoded query, so /product/a%2520b delivers
    // "a%20b" here — useRouteParams passes percentDecode: false and it must
    // survive, not double-decode to "a b".
    const slugRoute = definePagesRoute("/product/[slug]", {
      params: { slug: p.string() },
    });
    __setQuery({ slug: "a%20b" });
    const { result } = renderHook(() => useRouteParams(slugRoute));
    expect(result.current).toEqual({
      data: { slug: "a%20b" },
      status: "success",
    });
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

  it("an optional catch-all absent from query normalizes to [] (D6)", () => {
    __setQuery({});
    const { result } = renderHook(() => useRouteParams(docsRoute));
    expect(result.current).toEqual({
      data: { path: [] },
      status: "success",
    });
  });

  it("a present optional catch-all arrives as string[]", () => {
    __setQuery({ path: ["a", "b"] });
    const { result } = renderHook(() => useRouteParams(docsRoute));
    expect(result.current).toEqual({
      data: { path: ["a", "b"] },
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

  it("useSearch: a foreign (zod) failure arrives branded as SearchDecodeError", () => {
    // strictRoute's schema requires `q`; leaving it out makes zod reject, and
    // the foreign error must reach the hook already rebranded (core's
    // rebrandForeign), same as the /app twin pins.
    __setQuery({ id: "7" });
    const { result } = renderHook(() => useSearch(strictRoute));
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

describe("foreign useRouter failures propagate untranslated (PR5)", () => {
  it("an unrelated Error is rethrown by identity, never wrapped in ParamourError", () => {
    const boom = new Error("router exploded for an unrelated reason");
    __setThrow(boom);
    let caught: unknown;
    try {
      renderHook(() => useRouteParams(productRoute));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(ParamourError);
  });

  it("a non-Error throw passes through the instanceof guard untouched", () => {
    __setThrow("kaboom");
    let caught: unknown;
    try {
      renderHook(() => useSearch(productRoute));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe("kaboom");
  });
});

describe("raw-slice stabilization (design-07 SEL4)", () => {
  it("returns the identical result object across rerenders with the same query", () => {
    const query = { id: "42" };
    __setQuery(query);
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("a NEW query object with an identical declared slice keeps the identical result", () => {
    __setQuery({ id: "42" });
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    __setQuery({ id: "42" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("useSearch keeps the identical result for a NEW query with an identical declared slice", () => {
    __setQuery({ id: "42", page: "2" });
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setQuery({ id: "42", page: "2" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("unknown-key churn (?utm_source=) in the query bag keeps the identical result", () => {
    __setQuery({ id: "42", page: "2", utm_source: "a" });
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setQuery({ id: "42", page: "2", utm_source: "b" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("a changed declared key busts the fingerprint and re-decodes", () => {
    __setQuery({ id: "42", page: "2" });
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setQuery({ id: "42", page: "3" });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ data: { page: 3 }, status: "success" });
  });

  it("a rawSearch route's slice is every non-param key: unknown-key churn re-decodes", () => {
    // strictRoute's schema rejects unknown keys, so the second decode landing
    // in the ERROR arm proves the changed unknown key actually re-decoded —
    // the path param `id` alone stays outside the fingerprint (PR5
    // subtraction).
    __setQuery({ id: "7", q: "hi" });
    const { rerender, result } = renderHook(() => useSearch(strictRoute));
    expect(result.current.status).toBe("success");
    __setQuery({ id: "7", q: "hi", utm_source: "a" });
    rerender();
    expect(result.current.status).toBe("error");
  });

  it("pending results share one referentially stable object across hooks", () => {
    __setIsReady(false);
    const params = renderHook(() => useRouteParams(productRoute));
    const search = renderHook(() => useSearch(productRoute));
    expect(params.result.current).toBe(search.result.current);
  });
});

describe("selectors (design-07 SEL1–SEL6)", () => {
  it("useSearch projects the success arm through select (SEL2)", () => {
    __setQuery({ id: "42", page: "2" });
    const { result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    expect(result.current).toEqual({ data: 2, status: "success" });
  });

  it("the pending arm passes through the selector untouched (SEL2)", () => {
    __setIsReady(false);
    const { result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    expect(result.current).toEqual({ status: "pending" });
  });

  it("an unchanged selection keeps its previous wrapper when ANOTHER param changes", () => {
    __setQuery({ id: "42", page: "2", q: "hi" });
    const { rerender, result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    const first = result.current;
    __setQuery({ id: "42", page: "2", q: "bye" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("the error arm passes through the selector untouched (SEL2)", () => {
    __setQuery({ id: "42", page: "abc" });
    const { result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });

  it("useRouteParams takes the same selector surface (SEL1)", () => {
    __setQuery({ id: "42" });
    const { result } = renderHook(() =>
      useRouteParams(productRoute, { select: (params) => params.id }),
    );
    expect(result.current).toEqual({ data: 42, status: "success" });
  });

  it("a selector throw propagates, never becoming an arm (SEL5)", () => {
    __setQuery({ id: "42", page: "2" });
    expect(() =>
      renderHook(() =>
        useSearch(productRoute, {
          select: (): never => {
            throw new Error("selector bug");
          },
        }),
      ),
    ).toThrow("selector bug");
  });
});
