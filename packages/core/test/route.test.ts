import { describe, expect, it, vi } from "vitest";

import {
  defineRoute,
  p,
  ParamourError,
  ParamsDecodeError,
  ParseError,
  SearchDecodeError,
} from "../src";

describe("defineRoute define-time validation (RL1/RL2)", () => {
  it("rejects a ? anywhere in the literal", () => {
    expect(() => defineRoute("/search?q=1", {})).toThrow(ParamourError);
    expect(() => defineRoute("/search?q=1", {})).toThrow(
      /must not contain "\?"/,
    );
  });

  it("rejects a # anywhere in the literal", () => {
    expect(() => defineRoute("/docs#top", {})).toThrow(ParamourError);
    expect(() => defineRoute("/docs#top", {})).toThrow(/must not contain "#"/);
  });

  it("rejects a path not starting with /", () => {
    expect(() => defineRoute("about", {})).toThrow(ParamourError);
    expect(() => defineRoute("about", {})).toThrow(/must start with "\/"/);
  });

  it("rejects a trailing slash", () => {
    expect(() => defineRoute("/docs/", {})).toThrow(ParamourError);
    expect(() => defineRoute("/docs/", {})).toThrow(/must not end with "\/"/);
  });

  it('accepts "/" itself', () => {
    expect(() => defineRoute("/", {})).not.toThrow();
  });

  it("rejects an empty segment", () => {
    expect(() => defineRoute("/a//b", {})).toThrow(ParamourError);
    expect(() => defineRoute("/a//b", {})).toThrow(/empty segment/);
  });

  it("rejects a duplicate param name (types silently collapse the key)", () => {
    expect(() =>
      defineRoute("/a/[id]/b/[id]", { params: { id: p.string() } }),
    ).toThrow(ParamourError);
    expect(() =>
      defineRoute("/a/[id]/b/[id]", { params: { id: p.string() } }),
    ).toThrow(/declares param "id" more than once/);
  });

  it("rejects a non-final catch-all", () => {
    expect(() =>
      defineRoute("/a/[...rest]/b", { params: { rest: p.string() } }),
    ).toThrow(/must be the final segment/);
  });

  it("rejects a non-final optional catch-all", () => {
    expect(() =>
      defineRoute("/a/[[...rest]]/b", { params: { rest: p.string() } }),
    ).toThrow(/must be the final segment/);
  });

  it("rejects malformed bracket tokens", () => {
    for (const path of ["/user/[id", "/x/[]", "/x/[...]", "/x/a[b]c"]) {
      expect(() => defineRoute(path, {})).toThrow(ParamourError);
      expect(() => defineRoute(path, {})).toThrow(/malformed dynamic segment/);
    }
  });

  it("rejects a (group) segment — paths are URL-shaped (RL2)", () => {
    expect(() => defineRoute("/(marketing)/about", {})).toThrow(ParamourError);
    expect(() => defineRoute("/(marketing)/about", {})).toThrow(
      /route-group folder name/,
    );
  });

  it("rejects an @slot segment — paths are URL-shaped (RL2)", () => {
    expect(() => defineRoute("/@modal/photo", {})).toThrow(ParamourError);
    expect(() => defineRoute("/@modal/photo", {})).toThrow(
      /parallel-route slot/,
    );
  });

  it("accepts valid static, dynamic, and catch-all paths", () => {
    expect(() => defineRoute("/about", {})).not.toThrow();
    expect(() =>
      defineRoute("/product/[id]", { params: { id: p.integer() } }),
    ).not.toThrow();
    expect(() =>
      defineRoute("/blog/[...slug]", { params: { slug: p.string() } }),
    ).not.toThrow();
    expect(() =>
      defineRoute("/docs/[[...path]]", { params: { path: p.string() } }),
    ).not.toThrow();
  });
});

describe("route object shape (RL1)", () => {
  it("exposes the path literal and ~-prefixed configs", () => {
    const params = { id: p.integer() };
    const search = { q: p.string() };
    const route = defineRoute("/product/[id]", { params, search });
    expect(route.path).toBe("/product/[id]");
    expect(route["~params"]).toBe(params);
    expect(route["~search"]).toBe(search);
  });

  it("normalizes an omitted search config to {}", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    expect(route["~search"]).toEqual({});
  });

  it("normalizes a static route's params to {}", () => {
    const route = defineRoute("/about", {});
    expect(route["~params"]).toEqual({});
    expect(route["~search"]).toEqual({});
  });
});

describe("ParamsDecodeError (RL6)", () => {
  it("aggregates issues and mirrors SearchDecodeError's message format", () => {
    const issues = [
      { key: "id", message: "expected an integer" },
      { key: "slug", message: "required but missing" },
    ];
    const error = new ParamsDecodeError(issues);
    expect(error.issues).toBe(issues);
    expect(error.message).toBe(
      "Failed to decode route params: [id] expected an integer; [slug] required but missing",
    );
    expect(error.name).toBe("ParamsDecodeError");
  });
});

describe("instanceof brand hardening (RL6)", () => {
  it("native instanceof keeps working across the hierarchy", () => {
    const error = new ParamsDecodeError([]);
    expect(error).toBeInstanceOf(ParamsDecodeError);
    expect(error).toBeInstanceOf(ParamourError);
    expect(error).toBeInstanceOf(Error);
    const parse = new ParseError("nope");
    expect(parse).toBeInstanceOf(ParseError);
    expect(parse).toBeInstanceOf(ParamourError);
  });

  it("user subclasses still pass the base check", () => {
    class CustomError extends ParamourError {}
    expect(new CustomError("x")).toBeInstanceOf(ParamourError);
    expect(new CustomError("x")).toBeInstanceOf(Error);
  });

  it("a structurally identical foreign class is NOT instanceof ParamourError", () => {
    class FakeParamourError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ParamourError";
      }
    }
    expect(new FakeParamourError("x")).not.toBeInstanceOf(ParamourError);
  });

  it("sibling classes do not cross-match", () => {
    expect(new ParseError("x")).not.toBeInstanceOf(SearchDecodeError);
    expect(new ParseError("x")).not.toBeInstanceOf(ParamsDecodeError);
    expect(new SearchDecodeError([])).not.toBeInstanceOf(ParseError);
    expect(new ParamsDecodeError([])).not.toBeInstanceOf(SearchDecodeError);
  });

  it("a base instance is not instanceof a subclass", () => {
    expect(new ParamourError("x")).not.toBeInstanceOf(ParseError);
  });

  it("recognizes instances from a second copy of the package", async () => {
    // Simulates the dual-package / duplicated-copy hazard: reset vitest's
    // module registry so the barrel loads twice as distinct class identities
    // sharing only the Symbol.for brands.
    const copyA = await import("../src");
    vi.resetModules();
    const copyB = await import("../src");
    // Guard against the test rotting into comparing one copy with itself.
    expect(copyB.ParamourError).not.toBe(copyA.ParamourError);

    expect(new copyB.ParamsDecodeError([])).toBeInstanceOf(copyA.ParamourError);
    expect(new copyB.ParamsDecodeError([])).toBeInstanceOf(
      copyA.ParamsDecodeError,
    );
    expect(new copyB.ParseError("x")).toBeInstanceOf(copyA.ParseError);
    // Hierarchy stays correct across copies.
    expect(new copyB.ParseError("x")).not.toBeInstanceOf(
      copyA.SearchDecodeError,
    );
  });
});
