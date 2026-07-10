import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  defineRoute,
  href,
  p,
  ParamourError,
  ParamsDecodeError,
  ParseError,
  rawSearch,
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
    for (const path of [
      "/user/[id",
      "/x/[]",
      "/x/[...]",
      "/x/a[b]c",
      "/x/[[...]]",
      "/x/[a[b]]",
    ]) {
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
      defineRoute("/docs/[[...slug]]", { params: { slug: p.string() } }),
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

describe("route parse methods (RL6)", () => {
  const route = defineRoute("/product/[id]", {
    params: { id: p.integer() },
    search: { q: p.string() },
  });

  it("parse decodes plain props", async () => {
    await expect(
      route.parse({ params: { id: "42" }, searchParams: { q: "hi" } }),
    ).resolves.toEqual({ params: { id: 42 }, search: { q: "hi" } });
  });

  it("parse decodes promised props (Next 15/16 shape)", async () => {
    await expect(
      route.parse({
        params: Promise.resolve({ id: "42" }),
        searchParams: Promise.resolve({ q: "hi" }),
      }),
    ).resolves.toEqual({ params: { id: 42 }, search: { q: "hi" } });
  });

  it("a missing params member decodes like an empty source, never crashes", async () => {
    const result = await route.safeParse({ searchParams: { q: "hi" } });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
    expect(result.error.issues).toEqual([
      { key: "id", message: "required route param is missing" },
    ]);
  });

  it("a missing searchParams member is a search decode error when required", async () => {
    await expect(route.parse({ params: { id: "42" } })).rejects.toThrow(
      SearchDecodeError,
    );
  });

  it("a static route parses empty props to empty halves", async () => {
    const about = defineRoute("/about", {});
    await expect(about.parse({})).resolves.toEqual({ params: {}, search: {} });
  });

  it("params decode failures take precedence over search failures", async () => {
    // Both halves are invalid; the params failure (morally a 404) wins.
    await expect(
      route.parse({ params: { id: "nope" }, searchParams: {} }),
    ).rejects.toThrow(ParamsDecodeError);
  });

  it("a rejecting searchParams promise is awaited, branded, and never unhandled", async () => {
    // Params ALSO fail to decode here; awaiting both members up front means
    // the rejection is observed (no unhandled rejection) and surfaces first.
    await expect(
      route.parse({
        params: Promise.resolve({ id: "nope" }),
        searchParams: Promise.reject(new Error("boom")),
      }),
    ).rejects.toThrow(ParamourError);
    await expect(
      route.parse({
        params: Promise.resolve({ id: "nope" }),
        searchParams: Promise.reject(new Error("boom")),
      }),
    ).rejects.toThrow(/route props promise rejected: boom/);
  });

  it("parseParams resolves to the bare params object", async () => {
    await expect(route.parseParams({ params: { id: "42" } })).resolves.toEqual({
      id: 42,
    });
  });

  it("parseSearch resolves to the bare search object", async () => {
    await expect(
      route.parseSearch({ searchParams: { q: "hi" } }),
    ).resolves.toEqual({ q: "hi" });
  });

  it("safeParse discriminates on status (PR12)", async () => {
    const ok = await route.safeParse({
      params: { id: "42" },
      searchParams: { q: "hi" },
    });
    expect(ok).toEqual({
      data: { params: { id: 42 }, search: { q: "hi" } },
      status: "success",
    });

    const bad = await route.safeParse({
      params: { id: "nope" },
      searchParams: { q: "hi" },
    });
    expect(bad.status).toBe("error");
    if (bad.status !== "error") return;
    expect(bad.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("safeParseParams and safeParseSearch surface their half's error", async () => {
    const params = await route.safeParseParams({ params: { id: "nope" } });
    expect(params.status).toBe("error");
    if (params.status === "error") {
      expect(params.error).toBeInstanceOf(ParamsDecodeError);
    }

    const search = await route.safeParseSearch({ searchParams: {} });
    expect(search.status).toBe("error");
    if (search.status === "error") {
      expect(search.error).toBeInstanceOf(SearchDecodeError);
    }
  });

  it("safe variants rethrow non-decode errors (source-contract violations)", async () => {
    await expect(
      route.safeParse({ params: 5 as never, searchParams: {} }),
    ).rejects.toThrow(ParamourError);
    await expect(
      route.safeParseParams({ params: Promise.reject(new Error("nope")) }),
    ).rejects.toThrow(/route props promise rejected/);
  });

  it("safeParseSearch rethrows non-decode errors too", async () => {
    await expect(
      route.safeParseSearch({ searchParams: 5 as never }),
    ).rejects.toThrow(ParamourError);
  });

  it("the bare-surface methods await promised props (Next 15/16 shape)", async () => {
    await expect(
      route.parseParams({ params: Promise.resolve({ id: "42" }) }),
    ).resolves.toEqual({ id: 42 });
    await expect(
      route.parseSearch({ searchParams: Promise.resolve({ q: "hi" }) }),
    ).resolves.toEqual({ q: "hi" });
  });

  it("a props promise rejecting with a ParamourError passes through unwrapped", async () => {
    const branded = new ParamourError("already branded");
    let caught: unknown;
    try {
      await route.parseParams({ params: Promise.reject(branded) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(branded);
    expect((caught as Error).message).toBe("already branded");
  });
});

describe("route methods over a rawSearch config (design-04)", () => {
  // The full method surface must reach the rawSearch decode branch through
  // defineRoute's ~search wiring — raw-search.test.ts calls decodeSearch
  // directly, which would miss a defineRoute wiring regression.
  const route = defineRoute("/shop/[id]", {
    params: { id: p.integer() },
    search: rawSearch(
      z.object({ page: z.coerce.number().optional(), q: z.string() }),
    ),
  });

  it("parse decodes params and the whole-object search half together", async () => {
    await expect(
      route.parse({
        params: { id: "42" },
        searchParams: { page: "2", q: "hi" },
      }),
    ).resolves.toEqual({
      params: { id: 42 },
      search: { page: 2, q: "hi" },
    });
  });

  it("parseSearch returns the schema's own output", async () => {
    await expect(
      route.parseSearch({ searchParams: { q: "hi" } }),
    ).resolves.toEqual({ q: "hi" });
  });

  it("safeParseSearch maps schema issues into the error arm", async () => {
    const result = await route.safeParseSearch({ searchParams: {} });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(SearchDecodeError);
  });

  it("safeParse surfaces a params failure ahead of the search half", async () => {
    const result = await route.safeParse({
      params: { id: "nope" },
      searchParams: {},
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(ParamsDecodeError);
  });

  it("href accepts the raw wire record alongside required params", () => {
    expect(href(route, { params: { id: 42 }, search: { q: "a b" } })).toBe(
      "/shop/42?q=a%20b",
    );
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

  it("SearchDecodeError's message format is the mirror image", () => {
    const issues = [{ key: "q", message: "required but missing" }];
    const error = new SearchDecodeError(issues);
    expect(error.issues).toBe(issues);
    expect(error.message).toBe(
      "Failed to decode search params: [q] required but missing",
    );
    expect(error.name).toBe("SearchDecodeError");
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

  it("primitives and null never match (hasBrand's non-object guard)", () => {
    expect((5 as unknown) instanceof ParamourError).toBe(false);
    expect((null as unknown) instanceof ParamourError).toBe(false);
    expect(("ParamourError" as unknown) instanceof ParseError).toBe(false);
    expect((undefined as unknown) instanceof SearchDecodeError).toBe(false);
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
    expect(new copyB.SearchDecodeError([])).toBeInstanceOf(
      copyA.SearchDecodeError,
    );
    expect(new copyB.SerializeError("x")).toBeInstanceOf(copyA.SerializeError);
    // Hierarchy stays correct across copies.
    expect(new copyB.ParseError("x")).not.toBeInstanceOf(
      copyA.SearchDecodeError,
    );
  });
});
