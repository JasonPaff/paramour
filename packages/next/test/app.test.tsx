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

describe("useSearch (smoke: hook ↔ useSearchParams wiring)", () => {
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

describe("useRouteParams (smoke: hook ↔ useParams wiring)", () => {
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

describe("raw-slice stabilization (design-07 SEL4)", () => {
  it("returns the identical result object across rerenders with the same URLSearchParams", () => {
    __setSearchParams(new URLSearchParams("page=2"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("a NEW URLSearchParams with an identical declared slice keeps the identical result", () => {
    __setSearchParams(new URLSearchParams("page=2"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2"));
    rerender();
    expect(result.current).toBe(first);
  });

  it("unknown-key churn (?utm_source=) keeps the identical result — no re-decode", () => {
    __setSearchParams(new URLSearchParams("page=2&utm_source=a"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2&utm_source=b"));
    rerender();
    expect(result.current).toBe(first);
  });

  it("a changed declared key busts the fingerprint and re-decodes", () => {
    __setSearchParams(new URLSearchParams("page=2"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=3"));
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ data: { page: 3 }, status: "success" });
  });

  it("the ERROR arm is stabilized too: same malformed slice, new URLSearchParams", () => {
    __setSearchParams(new URLSearchParams("page=abc"));
    const { rerender, result } = renderHook(() => useSearch(productRoute));
    const first = result.current;
    expect(first.status).toBe("error");
    __setSearchParams(new URLSearchParams("page=abc&utm_source=x"));
    rerender();
    expect(result.current).toBe(first);
  });

  it("a rawSearch route's slice is ALL keys: unknown-key churn re-decodes there", () => {
    // The whole-object schema legitimately sees every key (P8 does not apply),
    // so no declared subset exists to stabilize on.
    __setSearchParams(new URLSearchParams("page=2&q=hi&utm_source=a"));
    const { rerender, result } = renderHook(() => useSearch(rawRoute));
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2&q=hi&utm_source=b"));
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });

  it("useRouteParams keeps the identical result for a NEW params object with identical content", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    __setParams({ id: "42" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("useRouteParams re-decodes when a segment value actually changes", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() => useRouteParams(productRoute));
    const first = result.current;
    __setParams({ id: "43" });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ data: { id: 43 }, status: "success" });
  });

  it("useRouteParamsOrThrow keeps the identical decoded object for a NEW identical params object", () => {
    __setParams({ id: "42" });
    const { rerender, result } = renderHook(() =>
      useRouteParamsOrThrow(productRoute),
    );
    const first = result.current;
    __setParams({ id: "42" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("useSearchOrThrow keeps the identical decoded object for a NEW identical URLSearchParams", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { rerender, result } = renderHook(() =>
      useSearchOrThrow(productRoute),
    );
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    rerender();
    expect(result.current).toBe(first);
  });

  it("a route swap at the same call site busts the cache even with an equal fingerprint", () => {
    const twinRoute = defineAppRoute("/product/[id]", {
      params: { id: p.integer() },
      search: {
        page: p.integer().default(1),
        q: p.string().optional(),
      },
    });
    __setSearchParams(new URLSearchParams("page=2"));
    const { rerender, result } = renderHook(
      ({ route }: { route: typeof productRoute }) => useSearch(route),
      { initialProps: { route: productRoute } },
    );
    const first = result.current;
    rerender({ route: twinRoute });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });
});

describe("selectors (design-07 SEL1–SEL6)", () => {
  it("useSearch projects the success arm through select (SEL2)", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    expect(result.current).toEqual({ data: 2, status: "success" });
  });

  it("an unchanged selection keeps its previous wrapper when ANOTHER param changes", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { rerender, result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=2&q=bye"));
    rerender();
    // The decode re-ran (q changed), but the selected slice is Object.is-equal
    // — the WRAPPER object comes back by identity (SEL2/SEL3). Inline-arrow
    // selector identity churn across renders is irrelevant (SEL6).
    expect(result.current).toBe(first);
  });

  it("a changed selection produces a new wrapper", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { rerender, result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    const first = result.current;
    __setSearchParams(new URLSearchParams("page=3&q=hi"));
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ data: 3, status: "success" });
  });

  it("the error arm passes through the selector untouched (SEL2)", () => {
    __setSearchParams(new URLSearchParams("page=abc"));
    const { result } = renderHook(() =>
      useSearch(productRoute, { select: (search) => search.page }),
    );
    expect(result.current.status).toBe("error");
    if (result.current.status !== "error") return;
    expect(result.current.error).toBeInstanceOf(SearchDecodeError);
  });

  it('an object selection churns under Object.is but holds with equality: "shallow" (SEL3)', () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const plain = renderHook(() =>
      useSearch(productRoute, {
        select: (search) => ({ page: search.page }),
      }),
    );
    const shallow = renderHook(() =>
      useSearch(productRoute, {
        equality: "shallow",
        select: (search) => ({ page: search.page }),
      }),
    );
    const firstPlain = plain.result.current;
    const firstShallow = shallow.result.current;
    __setSearchParams(new URLSearchParams("page=2&q=bye"));
    plain.rerender();
    shallow.rerender();
    // Default Object.is: a fresh { page } object per selector run → new wrapper.
    expect(plain.result.current).not.toBe(firstPlain);
    expect(plain.result.current).toEqual(firstPlain);
    // "shallow": same one-level contents → previous wrapper by identity.
    expect(shallow.result.current).toBe(firstShallow);
  });

  it("a selector throw propagates to the error boundary, never the error arm (SEL5)", () => {
    __setSearchParams(new URLSearchParams("page=2"));
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

  it("useSearchOrThrow returns the bare selection, stable across unrelated churn", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { rerender, result } = renderHook(() =>
      useSearchOrThrow(productRoute, { select: (search) => search.page }),
    );
    expect(result.current).toBe(2);
    __setSearchParams(new URLSearchParams("page=2&q=bye"));
    rerender();
    expect(result.current).toBe(2);
  });

  it("useRouteParams and useRouteParamsOrThrow take the same selector surface (SEL1)", () => {
    __setParams({ id: "42" });
    const safe = renderHook(() =>
      useRouteParams(productRoute, { select: (params) => params.id }),
    );
    expect(safe.result.current).toEqual({ data: 42, status: "success" });
    const orThrow = renderHook(() =>
      useRouteParamsOrThrow(productRoute, { select: (params) => params.id }),
    );
    expect(orThrow.result.current).toBe(42);
  });

  it("rawSearch routes select from the schema's output", () => {
    __setSearchParams(new URLSearchParams("page=2&q=hi"));
    const { result } = renderHook(() =>
      useSearch(rawRoute, { select: (search) => search.q }),
    );
    expect(result.current).toEqual({ data: "hi", status: "success" });
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
