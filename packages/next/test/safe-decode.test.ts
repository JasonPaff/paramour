import {
  defineRoute,
  p,
  ParamourError,
  ParamsDecodeError,
  SearchDecodeError,
} from "paramour";
import { describe, expect, it } from "vitest";

import { safeDecodeParams, safeDecodeSearch } from "../src/safe-decode.js";

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

describe("safeDecodeSearch", () => {
  it("returns { data } for a valid URLSearchParams source", () => {
    const result = safeDecodeSearch(
      productRoute,
      new URLSearchParams("page=2&q=hi"),
    );
    expect(result).toEqual({ data: { page: 2, q: "hi" } });
    expect(result.error).toBeUndefined();
  });

  it("applies codec defaults / optional absence", () => {
    const result = safeDecodeSearch(productRoute, new URLSearchParams());
    expect(result.data).toEqual({ page: 1, q: undefined });
  });

  it("returns { error: SearchDecodeError } for a malformed value", () => {
    const result = safeDecodeSearch(
      productRoute,
      new URLSearchParams("page=abc"),
    );
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(SearchDecodeError);
    expect(result.error?.issues.map((issue) => issue.key)).toEqual(["page"]);
  });

  it("recovers via .catch() into { data } rather than { error }", () => {
    const result = safeDecodeSearch(catchRoute, new URLSearchParams("page=x"));
    expect(result).toEqual({ data: { page: 0 } });
  });

  it("rethrows a non-decode error (contract violation stays loud)", () => {
    expect(() =>
      safeDecodeSearch(productRoute, null as unknown as URLSearchParams),
    ).toThrow(ParamourError);
  });
});

describe("safeDecodeParams", () => {
  it("returns { data } for a valid params source", () => {
    const result = safeDecodeParams(productRoute, { id: "42" });
    expect(result).toEqual({ data: { id: 42 } });
    expect(result.error).toBeUndefined();
  });

  it("returns { error: ParamsDecodeError } for a malformed segment", () => {
    const result = safeDecodeParams(productRoute, { id: "not-a-number" });
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("returns { error } when a required segment is missing", () => {
    const result = safeDecodeParams(productRoute, {});
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("rethrows a non-decode error (contract violation stays loud)", () => {
    expect(() =>
      safeDecodeParams(productRoute, null as unknown as Record<string, string>),
    ).toThrow(ParamourError);
  });
});
