import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  defineRoute,
  p,
  ParamourError,
  ParamsDecodeError,
  rawSearch,
  safeDecodeParams,
  safeDecodeSearch,
  SearchDecodeError,
} from "../src";

const productRoute = defineRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});

const catchRoute = defineRoute("/items", {
  search: { page: p.integer().catch(0) },
});

const tagsRoute = defineRoute("/tags", {
  search: { tags: p.stringArray() },
});

const filesRoute = defineRoute("/files/[...seg]", {
  params: { seg: p.string() },
});

const docsRoute = defineRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
});

const rawRoute = defineRoute("/raw", {
  search: rawSearch(
    z.object({ page: z.coerce.number().optional(), q: z.string() }),
  ),
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

/** Hand-rolled ASYNC Standard Schema (validate returns a Promise). */
const asyncSchema: StandardSchemaV1<unknown, Record<string, never>> = {
  "~standard": {
    validate: () => Promise.resolve({ value: {} }),
    vendor: "test",
    version: 1,
  },
};

describe("safeDecodeSearch", () => {
  it("returns the success arm for a valid URLSearchParams source", () => {
    const result = safeDecodeSearch(
      productRoute,
      new URLSearchParams("page=2&q=hi"),
    );
    expect(result).toEqual({ data: { page: 2, q: "hi" }, status: "success" });
  });

  it("applies codec defaults / optional absence", () => {
    const result = safeDecodeSearch(productRoute, new URLSearchParams());
    expect(result).toEqual({
      data: { page: 1, q: undefined },
      status: "success",
    });
  });

  it("returns the error arm holding a SearchDecodeError for a malformed value", () => {
    const result = safeDecodeSearch(
      productRoute,
      new URLSearchParams("page=abc"),
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(SearchDecodeError);
    expect(result.error.issues.map((issue) => issue.key)).toEqual(["page"]);
  });

  it("recovers via .catch() into the success arm rather than the error arm", () => {
    const result = safeDecodeSearch(catchRoute, new URLSearchParams("page=x"));
    expect(result).toEqual({ data: { page: 0 }, status: "success" });
  });

  it("rethrows a non-decode error (contract violation stays loud)", () => {
    expect(() =>
      safeDecodeSearch(productRoute, null as unknown as URLSearchParams),
    ).toThrow(ParamourError);
  });

  it("accepts a plain-object source (Next RSC searchParams shape)", () => {
    const result = safeDecodeSearch(productRoute, { page: "2", q: "hi" });
    expect(result).toEqual({ data: { page: 2, q: "hi" }, status: "success" });
  });

  it("accepts an array-valued key in a plain-object source for an array codec", () => {
    const result = safeDecodeSearch(tagsRoute, { tags: ["a", "b"] });
    expect(result).toEqual({ data: { tags: ["a", "b"] }, status: "success" });
  });

  it("aggregates one issue per failed key into a single error arm", () => {
    const multiRoute = defineRoute("/multi", {
      search: { count: p.integer(), flag: p.boolean() },
    });
    const result = safeDecodeSearch(
      multiRoute,
      new URLSearchParams("count=abc&flag=nope"),
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(SearchDecodeError);
    expect(result.error.issues.map((issue) => issue.key).sort()).toEqual([
      "count",
      "flag",
    ]);
  });
});

describe("safeDecodeSearch with a rawSearch route (design-04)", () => {
  it("returns the success arm holding the schema's own output", () => {
    const result = safeDecodeSearch(rawRoute, { page: "2", q: "hi" });
    expect(result).toEqual({ data: { page: 2, q: "hi" }, status: "success" });
  });

  it("returns the error arm holding a SearchDecodeError when the schema reports issues", () => {
    const result = safeDecodeSearch(rawRoute, new URLSearchParams("page=2"));
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(SearchDecodeError);
    expect(result.error.issues.map((issue) => issue.key)).toEqual(["q"]);
  });

  it("a schema whose validate THROWS stays loud (ParamourError, not the error arm)", () => {
    const route = defineRoute("/boom", { search: rawSearch(throwingSchema) });
    expect(() => safeDecodeSearch(route, {})).toThrow(ParamourError);
    expect(() => safeDecodeSearch(route, {})).toThrow(/validation threw/);
  });

  it("an async schema throws loudly (design-02 D7), never the error arm", () => {
    const route = defineRoute("/async", { search: rawSearch(asyncSchema) });
    expect(() => safeDecodeSearch(route, {})).toThrow(ParamourError);
    expect(() => safeDecodeSearch(route, {})).toThrow(/synchronous/);
  });
});

describe("safeDecodeParams", () => {
  it("returns the success arm for a valid params source", () => {
    const result = safeDecodeParams(productRoute, { id: "42" });
    expect(result).toEqual({ data: { id: 42 }, status: "success" });
  });

  it("returns the error arm holding a ParamsDecodeError for a malformed segment", () => {
    const result = safeDecodeParams(productRoute, { id: "not-a-number" });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("returns the error arm when a required segment is missing", () => {
    const result = safeDecodeParams(productRoute, {});
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("rethrows a non-decode error (contract violation stays loud)", () => {
    expect(() =>
      safeDecodeParams(productRoute, null as unknown as Record<string, string>),
    ).toThrow(ParamourError);
  });

  it("decodes a catch-all segment from its array source", () => {
    const result = safeDecodeParams(filesRoute, { seg: ["a", "b"] });
    expect(result).toEqual({ data: { seg: ["a", "b"] }, status: "success" });
  });

  it("decodes an absent optional catch-all to an empty array", () => {
    const result = safeDecodeParams(docsRoute, {});
    expect(result).toEqual({ data: { slug: [] }, status: "success" });
  });

  it("aggregates one issue per failed segment into a single error arm", () => {
    const pairRoute = defineRoute("/pair/[a]/[b]", {
      params: { a: p.integer(), b: p.integer() },
    });
    const result = safeDecodeParams(pairRoute, { a: "x", b: "y" });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
    expect(result.error.issues.map((issue) => issue.key).sort()).toEqual([
      "a",
      "b",
    ]);
  });
});
