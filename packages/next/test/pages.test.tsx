// @vitest-environment happy-dom
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ReactElement, ReactNode } from "react";

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

import type { PagesNavigationAdapter } from "../src/navigation-adapter.js";
import type { ParamourTestingOptions } from "../src/testing.js";

import { PagesNavigationContext } from "../src/navigation-adapter.js";
import { useRouteParams, useSearch } from "../src/pages.js";
import { ParamourTestingProvider } from "../src/testing.js";

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
  search: { tag: p.array() },
});

// A STRICT raw schema: any undeclared key fails the decode. The subtraction
// tests lean on this — with `id` left in the bag, decoding would error, so a
// success arm proves the path param was subtracted before the schema ran.
const strictRoute = definePagesRoute("/strict/[id]", {
  params: { id: p.integer() },
  search: rawSearch(z.strictObject({ q: z.string() })),
});

// The stub-era `__set*` choreography is now ordinary provider props:
// path-param keys go in `params`, everything else in `search` (the provider
// merges them into the one `query` bag real Next hands the pages router).
// Mid-test URL changes reassign `current` and rerender — which also proves
// the stable-adapter contract.
let current: ParamourTestingOptions = {};

const wrapper = ({ children }: { children: ReactNode }) => (
  <ParamourTestingProvider {...current}>{children}</ParamourTestingProvider>
);

beforeEach(() => {
  current = {};
});

describe("three-state RouterResult: pending until isReady", () => {
  it("useRouteParams: pending pre-isReady, success after the flip", () => {
    current = { isReady: false };
    const { rerender, result } = renderHook(
      () => useRouteParams(productRoute),
      {
        wrapper,
      },
    );
    expect(result.current).toEqual({ status: "pending" });
    current = { params: { id: "42" } };
    rerender();
    expect(result.current).toEqual({ data: { id: 42 }, status: "success" });
  });

  it("useSearch: pending pre-isReady, success after the flip", () => {
    current = { isReady: false };
    const { rerender, result } = renderHook(() => useSearch(productRoute), {
      wrapper,
    });
    expect(result.current).toEqual({ status: "pending" });
    current = { params: { id: "42" }, search: "page=2&q=hi" };
    rerender();
    expect(result.current).toEqual({
      data: { page: 2, q: "hi" },
      status: "success",
    });
  });

  it("pending is decoded from NOTHING: a populated pre-isReady query is ignored", () => {
    // Statically-optimized pages hand back `{}` pre-isReady, but the hook
    // must key on isReady, not on query looking usable.
    current = { isReady: false, params: { id: "42" } };
    const { result } = renderHook(() => useRouteParams(productRoute), {
      wrapper,
    });
    expect(result.current).toEqual({ status: "pending" });
  });
});

describe("useSearch subtracts the route's path params from router.query", () => {
  it("a strict raw schema succeeds because `id` never reaches it", () => {
    current = { params: { id: "7" }, search: "q=hi" };
    const { result } = renderHook(() => useSearch(strictRoute), { wrapper });
    expect(result.current).toEqual({ data: { q: "hi" }, status: "success" });
  });

  it("declared search keys decode from the merged bag; the param key is invisible", () => {
    current = { params: { id: "42" }, search: "page=2" };
    const { result } = renderHook(() => useSearch(productRoute), { wrapper });
    expect(result.current).toEqual({
      data: { page: 2 },
      status: "success",
    });
  });

  it("useRouteParams reads the SAME merged bag for the param half", () => {
    current = { params: { id: "42" }, search: "page=2" };
    const { result } = renderHook(() => useRouteParams(productRoute), {
      wrapper,
    });
    expect(result.current).toEqual({ data: { id: 42 }, status: "success" });
  });

  it("a hostile __proto__ key survives the subtraction as an ordinary own property", () => {
    // `?__proto__=polluted` reaches the pages router as an ordinary own
    // query key (Node's querystring layer; the provider's define-semantics
    // query build reproduces it). zod silently drops the key (its own
    // pollution guard), so a spy schema captures the exact bag the hook
    // hands over: had omitPathParams rebuilt it with SET semantics, the
    // value would have hit the prototype setter and vanished as data;
    // define semantics keep it an ordinary own key.
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
    current = { params: { id: "7" }, search: "__proto__=polluted" };
    const { result } = renderHook(() => useSearch(spyRoute), { wrapper });
    expect(result.current.status).toBe("success");
    // The key itself must arrive as an own enumerable property, with the
    // bag's prototype untouched.
    expect(Object.entries(seen ?? {})).toEqual([["__proto__", "polluted"]]);
    expect(Reflect.getPrototypeOf(seen ?? {})).toBe(Object.prototype);
  });
});

describe("query values arrive already percent-decoded (R5, no double-decode)", () => {
  it("a %20-bearing param survives as the literal string next/router hands back", () => {
    // next/router has already decoded query, so /product/a%2520b delivers
    // "a%20b" here — useRouteParams passes percentDecode: false and it must
    // survive, not double-decode to "a b". Passed via `params` (never
    // `search`) so no URLSearchParams layer re-decodes it.
    const slugRoute = definePagesRoute("/product/[slug]", {
      params: { slug: p.string() },
    });
    current = { params: { slug: "a%20b" } };
    const { result } = renderHook(() => useRouteParams(slugRoute), { wrapper });
    expect(result.current).toEqual({
      data: { slug: "a%20b" },
      status: "success",
    });
  });
});

describe("query value shapes", () => {
  it("catch-all param arrives as string[]", () => {
    current = { params: { slug: ["a", "b"] } };
    const { result } = renderHook(() => useRouteParams(filesRoute), {
      wrapper,
    });
    expect(result.current).toEqual({
      data: { slug: ["a", "b"] },
      status: "success",
    });
  });

  it("repeated query key (?tag=x&tag=y) decodes as an array", () => {
    // next/router parses repeats into an array before the hook sees them —
    // the provider's query build does the same from the repeated search key.
    current = { search: "tag=x&tag=y" };
    const { result } = renderHook(() => useSearch(tagsRoute), { wrapper });
    expect(result.current).toEqual({
      data: { tag: ["x", "y"] },
      status: "success",
    });
  });

  it("an optional catch-all absent from query normalizes to [] (D6)", () => {
    current = {};
    const { result } = renderHook(() => useRouteParams(docsRoute), { wrapper });
    expect(result.current).toEqual({
      data: { path: [] },
      status: "success",
    });
  });

  it("a present optional catch-all arrives as string[]", () => {
    current = { params: { path: ["a", "b"] } };
    const { result } = renderHook(() => useRouteParams(docsRoute), { wrapper });
    expect(result.current).toEqual({
      data: { path: ["a", "b"] },
      status: "success",
    });
  });
});

describe("decode failure is the error arm, never a throw", () => {
  it("useRouteParams: malformed param", () => {
    current = { params: { id: "nope" } };
    const { result } = renderHook(() => useRouteParams(productRoute), {
      wrapper,
    });
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("useSearch: malformed search value", () => {
    current = { params: { id: "1" }, search: "page=abc" };
    const { result } = renderHook(() => useSearch(productRoute), { wrapper });
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });

  it("useSearch: a foreign (zod) failure arrives branded as SearchDecodeError", () => {
    // strictRoute's schema requires `q`; leaving it out makes zod reject, and
    // the foreign error must reach the hook already rebranded (core's
    // rebrandForeign), same as the /app twin pins.
    current = { params: { id: "7" } };
    const { result } = renderHook(() => useSearch(strictRoute), { wrapper });
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });
});

describe("unmounted next/router (App Router placement)", () => {
  it("useRouteParams rethrows a ParamourError naming the /app-vs-/pages mistake", () => {
    current = { mounted: false };
    expect(() =>
      renderHook(() => useRouteParams(productRoute), { wrapper }),
    ).toThrow(ParamourError);
    expect(() =>
      renderHook(() => useRouteParams(productRoute), { wrapper }),
    ).toThrow(/@paramour-js\/next\/app/);
  });

  it("useSearch rethrows the same translation", () => {
    current = { mounted: false };
    expect(() =>
      renderHook(() => useSearch(productRoute), { wrapper }),
    ).toThrow(/App Router/);
  });
});

// A FOREIGN useRouter failure is a state the public provider deliberately
// does not model (it only reproduces the unmounted throw) — these tests pin
// pages.ts's passthrough internals, so they bypass the provider and render a
// hand-built adapter through the internal seam directly.
function throwingWrapper(
  boom: unknown,
): (props: { children: ReactNode }) => ReactElement {
  const adapter: PagesNavigationAdapter = {
    useRouter() {
      // Simulating arbitrary foreign throws (including non-Errors) is the
      // point; `unknown` keeps only-throw-error satisfied.
      throw boom;
    },
  };
  return function ThrowingWrapper({ children }) {
    return (
      <PagesNavigationContext.Provider value={adapter}>
        {children}
      </PagesNavigationContext.Provider>
    );
  };
}

describe("foreign useRouter failures propagate untranslated", () => {
  it("an unrelated Error is rethrown by identity, never wrapped in ParamourError", () => {
    const boom = new Error("router exploded for an unrelated reason");
    let caught: unknown;
    try {
      renderHook(() => useRouteParams(productRoute), {
        wrapper: throwingWrapper(boom),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(ParamourError);
  });

  it("a non-Error throw passes through the instanceof guard untouched", () => {
    let caught: unknown;
    try {
      renderHook(() => useSearch(productRoute), {
        wrapper: throwingWrapper("kaboom"),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe("kaboom");
  });
});

describe("raw-slice stabilization", () => {
  it("returns the identical result object across rerenders with the same query", () => {
    current = { params: { id: "42" } };
    const { rerender, result } = renderHook(
      () => useRouteParams(productRoute),
      {
        wrapper,
      },
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("a NEW query object with an identical declared slice keeps the identical result", () => {
    current = { params: { id: "42" } };
    const { rerender, result } = renderHook(
      () => useRouteParams(productRoute),
      {
        wrapper,
      },
    );
    const first = result.current;
    // Fresh options → the adapter rebuilds a NEW query bag with the same
    // declared slice.
    current = { params: { id: "42" } };
    rerender();
    expect(result.current).toBe(first);
  });

  it("useSearch keeps the identical result for a NEW query with an identical declared slice", () => {
    current = { params: { id: "42" }, search: "page=2" };
    const { rerender, result } = renderHook(() => useSearch(productRoute), {
      wrapper,
    });
    const first = result.current;
    current = { params: { id: "42" }, search: "page=2" };
    rerender();
    expect(result.current).toBe(first);
  });

  it("unknown-key churn (?utm_source=) in the query bag keeps the identical result", () => {
    current = { params: { id: "42" }, search: "page=2&utm_source=a" };
    const { rerender, result } = renderHook(() => useSearch(productRoute), {
      wrapper,
    });
    const first = result.current;
    current = { params: { id: "42" }, search: "page=2&utm_source=b" };
    rerender();
    expect(result.current).toBe(first);
  });

  it("a changed declared key busts the fingerprint and re-decodes", () => {
    current = { params: { id: "42" }, search: "page=2" };
    const { rerender, result } = renderHook(() => useSearch(productRoute), {
      wrapper,
    });
    const first = result.current;
    current = { params: { id: "42" }, search: "page=3" };
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ data: { page: 3 }, status: "success" });
  });

  it("a rawSearch route's slice is every non-param key: unknown-key churn re-decodes", () => {
    // strictRoute's schema rejects unknown keys, so the second decode landing
    // in the ERROR arm proves the changed unknown key actually re-decoded —
    // the path param `id` alone stays outside the fingerprint, having been
    // subtracted first.
    current = { params: { id: "7" }, search: "q=hi" };
    const { rerender, result } = renderHook(() => useSearch(strictRoute), {
      wrapper,
    });
    expect(result.current.status).toBe("success");
    current = { params: { id: "7" }, search: "q=hi&utm_source=a" };
    rerender();
    expect(result.current.status).toBe("error");
  });

  it("pending results share one referentially stable object across hooks", () => {
    current = { isReady: false };
    const params = renderHook(() => useRouteParams(productRoute), { wrapper });
    const search = renderHook(() => useSearch(productRoute), { wrapper });
    expect(params.result.current).toBe(search.result.current);
  });
});

describe("selectors", () => {
  it("useSearch projects the success arm through select", () => {
    current = { params: { id: "42" }, search: "page=2" };
    const { result } = renderHook(
      () => useSearch(productRoute, { select: (search) => search.page }),
      { wrapper },
    );
    expect(result.current).toEqual({ data: 2, status: "success" });
  });

  it("the pending arm passes through the selector untouched", () => {
    current = { isReady: false };
    const { result } = renderHook(
      () => useSearch(productRoute, { select: (search) => search.page }),
      { wrapper },
    );
    expect(result.current).toEqual({ status: "pending" });
  });

  it("an unchanged selection keeps its previous wrapper when ANOTHER param changes", () => {
    current = { params: { id: "42" }, search: "page=2&q=hi" };
    const { rerender, result } = renderHook(
      () => useSearch(productRoute, { select: (search) => search.page }),
      { wrapper },
    );
    const first = result.current;
    current = { params: { id: "42" }, search: "page=2&q=bye" };
    rerender();
    expect(result.current).toBe(first);
  });

  it("the error arm passes through the selector untouched", () => {
    current = { params: { id: "42" }, search: "page=abc" };
    const { result } = renderHook(
      () => useSearch(productRoute, { select: (search) => search.page }),
      { wrapper },
    );
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });

  it("useRouteParams takes the same selector surface", () => {
    current = { params: { id: "42" } };
    const { result } = renderHook(
      () => useRouteParams(productRoute, { select: (params) => params.id }),
      { wrapper },
    );
    expect(result.current).toEqual({ data: 42, status: "success" });
  });

  it("a selector throw propagates, never becoming an arm", () => {
    current = { params: { id: "42" }, search: "page=2" };
    expect(() =>
      renderHook(
        () =>
          useSearch(productRoute, {
            select: (): never => {
              throw new Error("selector bug");
            },
          }),
        { wrapper },
      ),
    ).toThrow("selector bug");
  });
});
