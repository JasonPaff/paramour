import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";

import {
  definePagesRoute,
  p,
  ParamourError,
  ParamsDecodeError,
  rawSearch,
  SearchDecodeError,
} from "../src";

/**
 * PR10/PR11 §5 — the pages server surface. parseContext reads
 * `ctx.params` (authoritative when present) and `ctx.query` (merged params +
 * search); the split and its failure taxonomy are what these tests pin.
 */

const productRoute = definePagesRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const strictRoute = definePagesRoute("/strict/[id]", {
  params: { id: p.integer() },
  search: { q: p.string() },
});

/** Hand-rolled Standard Schema whose validate THROWS (never returns issues). */
const throwingSchema: StandardSchemaV1<unknown, never> = {
  "~standard": {
    validate: () => {
      throw new Error("validator exploded");
    },
    vendor: "test",
    version: 1,
  },
};

describe("definePagesRoute define-time behavior (RL1/PR3)", () => {
  it("validates the path literal eagerly, like the app constructor", () => {
    expect(() => definePagesRoute("/docs/", {})).toThrow(ParamourError);
    expect(() => definePagesRoute("/(group)/x", {})).toThrow(ParamourError);
  });

  it("carries the pages brand at runtime", () => {
    expect(productRoute["~router"]).toBe("pages");
  });
});

describe("parseContext (PR10)", () => {
  it("decodes a getServerSideProps-shaped context: params authoritative, query minus param names is search", () => {
    const result = productRoute.parseContext({
      params: { id: "42" },
      query: { id: "42", page: "2", q: "hi" },
    });
    expect(result).toEqual({
      params: { id: 42 },
      search: { page: 2, q: "hi" },
    });
  });

  it("params wins over a divergent query value when present", () => {
    const result = productRoute.parseContext({
      params: { id: "42" },
      query: { id: "999", q: "hi" },
    });
    expect(result.params).toEqual({ id: 42 });
  });

  it("extracts path params from query by name when params is absent (getInitialProps shape)", () => {
    // NextPageContext carries query but NO params, even on dynamic routes;
    // Next's own merge gives route params precedence in query, so extraction
    // by segment name is sound (PR10).
    const result = productRoute.parseContext({
      query: { id: "42", page: "3" },
    });
    expect(result).toEqual({
      params: { id: 42 },
      search: { page: 3, q: undefined },
    });
  });

  it("a path param missing from BOTH sources is a decode error, not a contract violation", () => {
    expect(() => productRoute.parseContext({ query: { page: "2" } })).toThrow(
      ParamsDecodeError,
    );
  });

  it("decodes params first: a params failure throws before the search half (morally a 404)", () => {
    // Both halves are invalid; the params failure wins.
    expect(() => strictRoute.parseContext({ query: { id: "nope" } })).toThrow(
      ParamsDecodeError,
    );
  });

  it("a catch-all param arrives as an array through either source", () => {
    const files = definePagesRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(
      files.parseContext({
        params: { seg: ["a", "b"] },
        query: { seg: ["a", "b"] },
      }),
    ).toEqual({ params: { seg: ["a", "b"] }, search: {} });
    expect(files.parseContext({ query: { seg: ["a", "b"] } })).toEqual({
      params: { seg: ["a", "b"] },
      search: {},
    });
  });

  it("an absent optional catch-all normalizes to [] (D6), and its base path decodes", () => {
    const docs = definePagesRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    expect(docs.parseContext({ params: {}, query: {} })).toEqual({
      params: { slug: [] },
      search: {},
    });
  });

  it("a static route decodes an empty context to empty halves", () => {
    const legacy = definePagesRoute("/legacy", {});
    expect(legacy.parseContext({ query: {} })).toEqual({
      params: {},
      search: {},
    });
  });

  it("a repeated query key (array value) decodes through an array codec", () => {
    const tags = definePagesRoute("/tags", {
      search: { tags: p.stringArray() },
    });
    expect(tags.parseContext({ query: { tags: ["a", "b"] } }).search).toEqual({
      tags: ["a", "b"],
    });
  });

  it("unknown query keys are never read (P8)", () => {
    const result = productRoute.parseContext({
      params: { id: "42" },
      query: { id: "42", unrelated: "junk" },
    });
    expect(result.search).toEqual({ page: 1, q: undefined });
  });

  it("a non-object context is a loud contract violation", () => {
    expect(() => productRoute.parseContext(null as never)).toThrow(
      ParamourError,
    );
    expect(() => productRoute.parseContext("ctx" as never)).toThrow(
      ParamourError,
    );
  });

  it("a query-less context (getStaticProps shape) is a loud contract violation naming the fix", () => {
    expect(() =>
      productRoute.parseContext({ params: { id: "1" } } as never),
    ).toThrow(ParamourError);
    expect(() =>
      productRoute.parseContext({ params: { id: "1" } } as never),
    ).toThrow(/getStaticProps/);
  });

  it("a garbage params member stays loud (decodeParams's source contract)", () => {
    expect(() =>
      productRoute.parseContext({ params: 5 as never, query: {} }),
    ).toThrow(ParamourError);
  });
});

describe("safeParseContext (PR10/PR12)", () => {
  it("wraps a valid decode in the success arm", () => {
    const result = productRoute.safeParseContext({
      params: { id: "42" },
      query: { id: "42", q: "hi" },
    });
    expect(result).toEqual({
      data: { params: { id: 42 }, search: { page: 1, q: "hi" } },
      status: "success",
    });
  });

  it("maps a params decode failure into the error arm", () => {
    const result = productRoute.safeParseContext({
      params: { id: "nope" },
      query: {},
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("maps a search decode failure into the error arm", () => {
    const result = strictRoute.safeParseContext({
      params: { id: "42" },
      query: {},
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(SearchDecodeError);
  });

  it("rethrows contract violations (safely's taxonomy — only decode failures become the error arm)", () => {
    expect(() => productRoute.safeParseContext(null as never)).toThrow(
      ParamourError,
    );
    expect(() =>
      productRoute.safeParseContext({ params: { id: "1" } } as never),
    ).toThrow(ParamourError);
  });

  it("a throwing rawSearch schema stays loud (rebranded foreign error, never the error arm)", () => {
    const boom = definePagesRoute("/boom", {
      search: rawSearch(throwingSchema),
    });
    expect(() => boom.safeParseContext({ query: {} })).toThrow(ParamourError);
    expect(() => boom.safeParseContext({ query: {} })).toThrow(
      /validation threw/,
    );
  });
});
