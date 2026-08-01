// @vitest-environment happy-dom
/**
 * Provider-specific behavior of `@paramour-js/next/testing` — the surface
 * the migrated hook suites do not pin: input normalization and defaulting,
 * the two differentiator states (`params: null`, `mounted: false`),
 * `onReplace` capture through BOTH flavors' devtools navigate capability,
 * the one-provider hybrid story, and the stable-adapter contract under
 * provider prop updates. Every test consumes the provider the way a user
 * would — `withParamourTesting` as testing-library's `wrapper`, or the
 * provider element directly when a test must update its props via rerender.
 */
import { render, renderHook } from "@testing-library/react";
import {
  defineAppRoute,
  definePagesRoute,
  p,
  ParamourError,
  ParamsDecodeError,
} from "paramour";
import { useContext } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { ParamourObservation } from "../src/devtools-seam.js";

import {
  useRouteParams as useAppRouteParams,
  useRouteParamsOrThrow as useAppRouteParamsOrThrow,
  useSearch as useAppSearch,
} from "../src/app.js";
import { getParamourSeam } from "../src/devtools-seam.js";
import { AppNavigationContext } from "../src/navigation-adapter.js";
import {
  useRouteParams as usePagesRouteParams,
  useSearch as usePagesSearch,
} from "../src/pages.js";
import {
  ParamourTestingProvider,
  withParamourTesting,
} from "../src/testing.js";

const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const aboutRoute = defineAppRoute("/about", {
  search: { q: p.string().optional() },
});

const pagesProductRoute = definePagesRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { page: p.integer().default(1) },
});

const pagesHomeRoute = definePagesRoute("/", {
  search: { q: p.string().optional() },
});

const pagesTagsRoute = definePagesRoute("/tags", {
  search: { tag: p.array() },
});

function buffer(): readonly ParamourObservation[] {
  return getParamourSeam().buffer;
}

beforeEach(() => {
  // The onReplace/defaults tests read seam observations; start each test
  // from an empty buffer like the observe suites do.
  const seam = getParamourSeam();
  seam.buffer.length = 0;
  seam.listeners.clear();
});

describe("search normalization", () => {
  it('"?page=2", "page=2", and an equivalent URLSearchParams decode identically', () => {
    const inputs = ["?page=2", "page=2", new URLSearchParams("page=2")];
    for (const search of inputs) {
      const { result } = renderHook(() => useAppSearch(productRoute), {
        wrapper: withParamourTesting({ search }),
      });
      expect(result.current).toEqual({ data: { page: 2 }, status: "success" });
    }
  });
});

describe("defaults: no options at all", () => {
  it("the app adapter hands the hooks {} — NOT the null a bare mock returns", () => {
    let seen: unknown = "unset";
    function AdapterProbe(): null {
      seen = useContext(AppNavigationContext)?.useParams();
      return null;
    }
    render(
      <ParamourTestingProvider>
        <AdapterProbe />
      </ParamourTestingProvider>,
    );
    expect(seen).toEqual({});
    expect(seen).not.toBeNull();
  });

  it("a param-less app route decodes params to success", () => {
    const { result } = renderHook(() => useAppRouteParams(aboutRoute), {
      wrapper: withParamourTesting(),
    });
    expect(result.current).toEqual({ data: {}, status: "success" });
  });

  it("app search decodes empty: defaults fill, optionals stay absent", () => {
    const { result } = renderHook(() => useAppSearch(productRoute), {
      wrapper: withParamourTesting(),
    });
    expect(result.current).toEqual({ data: { page: 1 }, status: "success" });
  });

  it('pages asPath derives as "/" (observation pathname pins the path part)', () => {
    const { result } = renderHook(() => usePagesSearch(pagesHomeRoute), {
      wrapper: withParamourTesting(),
    });
    expect(result.current).toEqual({ data: {}, status: "success" });
    expect(buffer()[0]?.pathname).toBe("/");
  });
});

describe("params: null — the hybrid-app useParams() state", () => {
  it("the adapter passes null through — it does NOT coerce to {}", () => {
    let seen: unknown = "unset";
    function AdapterProbe(): null {
      seen = useContext(AppNavigationContext)?.useParams();
      return null;
    }
    render(
      <ParamourTestingProvider params={null}>
        <AdapterProbe />
      </ParamourTestingProvider>,
    );
    expect(seen).toBeNull();
  });

  it("useRouteParams degrades to the ParamsDecodeError arm, not a crash", () => {
    const { result } = renderHook(() => useAppRouteParams(productRoute), {
      wrapper: withParamourTesting({ params: null }),
    });
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("useRouteParamsOrThrow throws the documented ParamsDecodeError", () => {
    expect(() =>
      renderHook(() => useAppRouteParamsOrThrow(productRoute), {
        wrapper: withParamourTesting({ params: null }),
      }),
    ).toThrow(ParamsDecodeError);
  });
});

describe("mounted: false — pages router unmounted under app/", () => {
  it("pages useRouteParams throws the translated ParamourError naming @paramour-js/next/app", () => {
    const wrapper = withParamourTesting({ mounted: false });
    expect(() =>
      renderHook(() => usePagesRouteParams(pagesProductRoute), { wrapper }),
    ).toThrow(ParamourError);
    expect(() =>
      renderHook(() => usePagesRouteParams(pagesProductRoute), { wrapper }),
    ).toThrow(/@paramour-js\/next\/app/);
  });
});

describe("isReady: false — the pending arm, flipped by a prop update", () => {
  it("pages hooks return pending; rerendering with isReady true yields the decode", () => {
    let paramsResult: unknown;
    let searchResult: unknown;
    function Probe(): null {
      paramsResult = usePagesRouteParams(pagesProductRoute);
      searchResult = usePagesSearch(pagesProductRoute);
      return null;
    }
    const { rerender } = render(
      <ParamourTestingProvider
        isReady={false}
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=2"
      >
        <Probe />
      </ParamourTestingProvider>,
    );
    expect(paramsResult).toEqual({ status: "pending" });
    expect(searchResult).toEqual({ status: "pending" });
    rerender(
      <ParamourTestingProvider
        isReady
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=2"
      >
        <Probe />
      </ParamourTestingProvider>,
    );
    expect(paramsResult).toEqual({ data: { id: 42 }, status: "success" });
    expect(searchResult).toEqual({ data: { page: 2 }, status: "success" });
  });
});

describe("onReplace captures both flavors' devtools navigations", () => {
  it("app flavor: navigate resolves pathname + search + live hash", () => {
    const captured: string[] = [];
    renderHook(() => useAppSearch(productRoute), {
      wrapper: withParamourTesting({
        onReplace: (href) => captured.push(href),
        params: { id: "42" },
        pathname: "/product/42",
        search: "page=2",
      }),
    });
    // makeAppNavigate reads the LIVE hash at call time, so set it after
    // mount and before the navigate.
    window.location.hash = "#frag";
    buffer()[0]?.navigate("?page=9");
    window.location.hash = "";
    expect(captured).toEqual(["/product/42?page=9#frag"]);
  });

  it("pages flavor: navigate resolves against asPath's path part", () => {
    const captured: string[] = [];
    renderHook(() => usePagesRouteParams(pagesProductRoute), {
      wrapper: withParamourTesting({
        onReplace: (href) => captured.push(href),
        params: { id: "7" },
        pathname: "/product/7",
        search: "page=2",
      }),
    });
    // asPath is "/product/7?page=2"; the navigate strips its query part.
    buffer()[0]?.navigate("?page=9");
    expect(captured).toEqual(["/product/7?page=9"]);
  });
});

describe("one provider feeds both flavors", () => {
  it("an app-route hook and a pages-route hook decode under a SINGLE wrapper", () => {
    let appResult: unknown;
    let pagesResult: unknown;
    function HybridProbe(): null {
      appResult = useAppSearch(productRoute);
      pagesResult = usePagesRouteParams(pagesProductRoute);
      return null;
    }
    render(
      <ParamourTestingProvider
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=2"
      >
        <HybridProbe />
      </ParamourTestingProvider>,
    );
    expect(appResult).toEqual({ data: { page: 2 }, status: "success" });
    expect(pagesResult).toEqual({ data: { id: 42 }, status: "success" });
  });
});

describe("adapter stability across prop updates", () => {
  it("undeclared-key search churn through rerenders keeps the identical result object", () => {
    let current: unknown;
    let renders = 0;
    function Probe(): null {
      renders += 1;
      current = useAppSearch(productRoute);
      return null;
    }
    const { rerender } = render(
      <ParamourTestingProvider
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=2&utm_source=a"
      >
        <Probe />
      </ParamourTestingProvider>,
    );
    const first = current;
    expect(first).toEqual({ data: { page: 2 }, status: "success" });
    rerender(
      <ParamourTestingProvider
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=2&utm_source=b"
      >
        <Probe />
      </ParamourTestingProvider>,
    );
    // The probe re-rendered (no remount — a remount would reset the ref
    // cache and mint a new result object), yet the result held identity.
    expect(renders).toBeGreaterThan(1);
    expect(current).toBe(first);
  });

  it("a declared-key change through the SAME stable adapter re-decodes", () => {
    let current: unknown;
    function Probe(): null {
      current = useAppSearch(productRoute);
      return null;
    }
    const { rerender } = render(
      <ParamourTestingProvider
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=2"
      >
        <Probe />
      </ParamourTestingProvider>,
    );
    const first = current;
    rerender(
      <ParamourTestingProvider
        params={{ id: "42" }}
        pathname="/product/42"
        search="page=3"
      >
        <Probe />
      </ParamourTestingProvider>,
    );
    // Prop updates mutate what the stable adapter RETURNS — the new value
    // must flow through without a provider remount.
    expect(current).not.toBe(first);
    expect(current).toEqual({ data: { page: 3 }, status: "success" });
  });
});

describe("pages query merge", () => {
  it('repeated search key "tag=a&tag=b" arrives as string[]', () => {
    const { result } = renderHook(() => usePagesSearch(pagesTagsRoute), {
      wrapper: withParamourTesting({
        pathname: "/tags",
        search: "tag=a&tag=b",
      }),
    });
    expect(result.current).toEqual({
      data: { tag: ["a", "b"] },
      status: "success",
    });
  });

  it("a path-param key passed via params overrides a same-named search key", () => {
    const { result } = renderHook(
      () => usePagesRouteParams(pagesProductRoute),
      {
        wrapper: withParamourTesting({
          params: { id: "42" },
          pathname: "/product/42",
          search: "id=999&page=2",
        }),
      },
    );
    expect(result.current).toEqual({ data: { id: 42 }, status: "success" });
  });

  it("the search half never sees the path param (subtraction intact)", () => {
    const { result } = renderHook(() => usePagesSearch(pagesProductRoute), {
      wrapper: withParamourTesting({
        params: { id: "42" },
        pathname: "/product/42",
        search: "id=999&page=2",
      }),
    });
    expect(result.current).toEqual({ data: { page: 2 }, status: "success" });
  });
});
