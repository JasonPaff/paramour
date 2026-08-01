import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  decodeParams,
  decodeSearch,
  defineAppRoute,
  href,
  p,
  ParamourError,
  ParamsDecodeError,
  ParseError,
  rawSearch,
  SearchDecodeError,
} from "../src";

describe("defineAppRoute define-time validation", () => {
  it("rejects a ? anywhere in the literal", () => {
    expect(() => defineAppRoute("/search?q=1", {})).toThrow(ParamourError);
    expect(() => defineAppRoute("/search?q=1", {})).toThrow(
      /must not contain "\?"/,
    );
  });

  it("rejects a # anywhere in the literal", () => {
    expect(() => defineAppRoute("/docs#top", {})).toThrow(ParamourError);
    expect(() => defineAppRoute("/docs#top", {})).toThrow(
      /must not contain "#"/,
    );
  });

  it("rejects a path not starting with /", () => {
    expect(() => defineAppRoute("about", {})).toThrow(ParamourError);
    expect(() => defineAppRoute("about", {})).toThrow(/must start with "\/"/);
  });

  it("rejects a trailing slash", () => {
    expect(() => defineAppRoute("/docs/", {})).toThrow(ParamourError);
    expect(() => defineAppRoute("/docs/", {})).toThrow(
      /must not end with "\/"/,
    );
  });

  it('accepts "/" itself', () => {
    expect(() => defineAppRoute("/", {})).not.toThrow();
  });

  it("rejects an empty segment", () => {
    expect(() => defineAppRoute("/a//b", {})).toThrow(ParamourError);
    expect(() => defineAppRoute("/a//b", {})).toThrow(/empty segment/);
  });

  it("rejects a duplicate param name (types silently collapse the key)", () => {
    expect(() =>
      defineAppRoute("/a/[id]/b/[id]", { params: { id: p.string() } }),
    ).toThrow(ParamourError);
    expect(() =>
      defineAppRoute("/a/[id]/b/[id]", { params: { id: p.string() } }),
    ).toThrow(/declares param "id" more than once/);
  });

  it("rejects a non-final catch-all", () => {
    expect(() =>
      defineAppRoute("/a/[...rest]/b", { params: { rest: p.string() } }),
    ).toThrow(/must be the final segment/);
  });

  it("rejects a non-final optional catch-all", () => {
    expect(() =>
      defineAppRoute("/a/[[...rest]]/b", { params: { rest: p.string() } }),
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
      expect(() => defineAppRoute(path, {})).toThrow(ParamourError);
      expect(() => defineAppRoute(path, {})).toThrow(
        /malformed dynamic segment/,
      );
    }
  });

  it("rejects a (group) segment — paths are URL-shaped", () => {
    expect(() => defineAppRoute("/(marketing)/about", {})).toThrow(
      ParamourError,
    );
    expect(() => defineAppRoute("/(marketing)/about", {})).toThrow(
      /route-group folder name/,
    );
  });

  it("rejects an @slot segment — paths are URL-shaped", () => {
    expect(() => defineAppRoute("/@modal/photo", {})).toThrow(ParamourError);
    expect(() => defineAppRoute("/@modal/photo", {})).toThrow(
      /parallel-route slot/,
    );
  });

  it("accepts valid static, dynamic, and catch-all paths", () => {
    expect(() => defineAppRoute("/about", {})).not.toThrow();
    expect(() =>
      defineAppRoute("/product/[id]", { params: { id: p.integer() } }),
    ).not.toThrow();
    expect(() =>
      defineAppRoute("/blog/[...slug]", { params: { slug: p.string() } }),
    ).not.toThrow();
    expect(() =>
      defineAppRoute("/docs/[[...slug]]", { params: { slug: p.string() } }),
    ).not.toThrow();
  });
});

describe("route object shape", () => {
  it("exposes the path literal and ~-prefixed configs", () => {
    const params = { id: p.integer() };
    const search = { q: p.string() };
    const route = defineAppRoute("/product/[id]", { params, search });
    expect(route.path).toBe("/product/[id]");
    expect(route["~params"]).toBe(params);
    expect(route["~search"]).toBe(search);
  });

  it("normalizes an omitted search config to {}", () => {
    const route = defineAppRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    expect(route["~search"]).toEqual({});
  });

  it("normalizes a static route's params to {}", () => {
    const route = defineAppRoute("/about", {});
    expect(route["~params"]).toEqual({});
    expect(route["~search"]).toEqual({});
  });
});

describe("route parse methods", () => {
  const route = defineAppRoute("/product/[id]", {
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
      {
        expected: "integer",
        key: "id",
        message: "required route param is missing",
        reason: "missing",
      },
    ]);
  });

  it("a missing searchParams member is a search decode error when required", async () => {
    await expect(route.parse({ params: { id: "42" } })).rejects.toThrow(
      SearchDecodeError,
    );
  });

  it("a static route parses empty props to empty halves", async () => {
    const about = defineAppRoute("/about", {});
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

  it("a framework control-flow rejection (string digest) passes through UNWRAPPED", async () => {
    // Next rejects the searchParams promise itself with its dynamic-usage
    // sentinel during a generateStaticParams prerender; the digest is how
    // Next recognizes its own bailout, so branding it fails the build.
    const sentinel = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    await expect(
      route.parse({
        params: Promise.resolve({ id: "42" }),
        searchParams: Promise.reject(sentinel),
      }),
    ).rejects.toBe(sentinel);
    // A digest-less rejection still gets the ParamourError brand (the test
    // above); a NON-STRING digest is not the convention and brands too.
    await expect(
      route.parse({
        params: Promise.resolve({ id: "42" }),
        searchParams: Promise.reject(
          Object.assign(new Error("boom"), { digest: 42 }),
        ),
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

  it("safeParse discriminates on status", async () => {
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

describe("route methods over a rawSearch config", () => {
  // The full method surface must reach the rawSearch decode branch through
  // defineAppRoute's ~search wiring — raw-search.test.ts calls decodeSearch
  // directly, which would miss a defineAppRoute wiring regression.
  const route = defineAppRoute("/shop/[id]", {
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

describe("ParamsDecodeError", () => {
  it("aggregates issues and mirrors SearchDecodeError's message format", () => {
    const issues = [
      { key: "id", message: "expected an integer" },
      { key: "slug", message: "required but missing" },
    ];
    const error = new ParamsDecodeError(issues);
    expect(error.issues).toBe(issues);
    expect(error.message).toBe(
      "Failed to decode route params:\n" +
        "  ✖ id: expected an integer\n" +
        "  ✖ slug: required but missing",
    );
    expect(error.name).toBe("ParamsDecodeError");
    expect(error.route).toBeNull();
  });

  it("SearchDecodeError's message format is the mirror image", () => {
    const issues = [{ key: "q", message: "required but missing" }];
    const error = new SearchDecodeError(issues);
    expect(error.issues).toBe(issues);
    expect(error.message).toBe(
      "Failed to decode search params:\n  ✖ q: required but missing",
    );
    expect(error.name).toBe("SearchDecodeError");
    expect(error.route).toBeNull();
  });

  it("a route path anchors the header and is carried on the error", () => {
    const error = new ParamsDecodeError(
      [{ key: "id", message: "expected an integer" }],
      "/users/[id]",
    );
    expect(error.message).toBe(
      "Failed to decode route params for /users/[id]:\n" +
        "  ✖ id: expected an integer",
    );
    expect(error.route).toBe("/users/[id]");
  });

  it("(expected …) is keyed on the issue's reason, never wire presence", () => {
    // "missing" and "validate" take the suffix (their messages cannot name
    // the expected shape); "parse", "duplicate", and reason-less prose do
    // not — wire presence plays no part.
    const error = new SearchDecodeError([
      {
        expected: "integer",
        key: "page",
        message: "required but missing",
        reason: "missing",
      },
      {
        expected: "integer",
        key: "size",
        message: '"x" is not an integer',
        reason: "parse",
        wire: "x",
      },
      {
        expected: "string",
        key: "q",
        message: "too short",
        reason: "validate",
        wire: "ab",
      },
      {
        expected: "integer",
        key: "dup",
        message: "received 2 values for a single-value param",
        reason: "duplicate",
      },
      { expected: "integer", key: "raw", message: "prose only" },
    ]);
    expect(error.message).toBe(
      "Failed to decode search params:\n" +
        "  ✖ page: required but missing (expected integer)\n" +
        '  ✖ size: "x" is not an integer\n' +
        "  ✖ q: too short (expected string)\n" +
        "  ✖ dup: received 2 values for a single-value param\n" +
        "  ✖ raw: prose only",
    );
  });
});

describe("decode-issue enrichment", () => {
  const capture = (run: () => unknown): unknown => {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error("expected a throw");
  };

  it("decodeParams cites the route, wire value, and expected shape", () => {
    const route = defineAppRoute("/users/[id]", {
      params: { id: p.integer() },
    });
    const error = capture(() => decodeParams(route, { id: "abc" }));
    if (!(error instanceof ParamsDecodeError)) throw new Error("wrong class");
    expect(error.route).toBe("/users/[id]");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer",
        key: "id",
        message: '"abc" is not an integer',
        reason: "parse",
        wire: "abc",
      },
    ]);
    expect(error.message).toBe(
      "Failed to decode route params for /users/[id]:\n" +
        '  ✖ id: "abc" is not an integer',
    );
  });

  it("wire is the DECODED segment, not the raw URL text (grammar-layer)", () => {
    // Pins the Issue.wire contract: route params are percent-decoded by
    // core (R5) before the codec grammar runs, so the recorded wire value
    // is the decoded segment — matching search, where the platform decodes
    // before the library reads. The URL segment "1%20x" therefore records
    // wire "1 x", a string that never literally appears in the URL.
    const route = defineAppRoute("/users/[id]", {
      params: { id: p.integer() },
    });
    const error = capture(() => decodeParams(route, { id: "1%20x" }));
    if (!(error instanceof ParamsDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer",
        key: "id",
        message: '"1 x" is not an integer',
        reason: "parse",
        wire: "1 x",
      },
    ]);
  });

  it("a missing catch-all cites the repeated expected form", () => {
    const route = defineAppRoute("/files/[...parts]", {
      params: { parts: p.integer() },
    });
    const error = capture(() => decodeParams(route, {}));
    if (!(error instanceof ParamsDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer[]",
        key: "parts",
        message: "required route param is missing",
        reason: "missing",
      },
    ]);
    expect(error.message).toContain("(expected integer[])");
  });

  it("a catch-all element failure cites the repeated expected form", () => {
    // One param, one "expected": an element-level parse failure must cite
    // the same integer[] label as the missing/shape issues above (and as
    // decodeSearch's array-element failures), not the bare element shape.
    const route = defineAppRoute("/files/[...parts]", {
      params: { parts: p.integer() },
    });
    const error = capture(() => decodeParams(route, { parts: ["1", "x"] }));
    if (!(error instanceof ParamsDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer[]",
        key: "parts",
        message: 'element 1: "x" is not an integer',
        reason: "parse",
        wire: "x",
      },
    ]);
  });

  it("a non-string catch-all element cites the repeated expected form", () => {
    const route = defineAppRoute("/files/[...parts]", {
      params: { parts: p.integer() },
    });
    const error = capture(() =>
      decodeParams(route, { parts: ["1", 2] as unknown as string[] }),
    );
    if (!(error instanceof ParamsDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer[]",
        key: "parts",
        message: "element 1: expected a string, got number",
        reason: "shape",
      },
    ]);
    // A shape issue's message states the problem completely; the grammar
    // label is not what failed, so no suffix renders.
    expect(error.message).not.toContain("(expected");
  });

  it("decodeSearch threads the route path and enriches issues", () => {
    const error = capture(() =>
      decodeSearch(
        { page: p.integer(), sort: p.enum(["asc", "desc"]) },
        { sort: "up" },
        "/users/[id]",
      ),
    );
    if (!(error instanceof SearchDecodeError)) throw new Error("wrong class");
    expect(error.route).toBe("/users/[id]");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer",
        key: "page",
        message: "required search param is missing",
        reason: "missing",
      },
      {
        expected: "enum(asc|desc)",
        key: "sort",
        message: '"up" is not one of: asc, desc',
        reason: "parse",
        wire: "up",
      },
    ]);
    expect(error.message).toBe(
      "Failed to decode search params for /users/[id]:\n" +
        "  ✖ page: required search param is missing (expected integer)\n" +
        '  ✖ sort: "up" is not one of: asc, desc',
    );
  });

  it("the duplicate-scalar rejection carries no single wire value", () => {
    const error = capture(() =>
      decodeSearch({ page: p.integer() }, new URLSearchParams("page=1&page=2")),
    );
    if (!(error instanceof SearchDecodeError)) throw new Error("wrong class");
    expect(error.route).toBeNull();
    expect(error.issues).toStrictEqual([
      {
        expected: "integer",
        key: "page",
        message: "received 2 values for a single-value param",
        reason: "duplicate",
      },
    ]);
  });

  it("an array codec failure cites the offending element's wire value", () => {
    const error = capture(() =>
      decodeSearch(
        { ids: p.array(p.integer()) },
        new URLSearchParams("ids=1&ids=x"),
      ),
    );
    if (!(error instanceof SearchDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer[]",
        key: "ids",
        message: '"x" is not an integer',
        reason: "parse",
        wire: "x",
      },
    ]);
  });
});

describe("the (expected …) suffix keys on the failure kind", () => {
  const capture = (run: () => unknown): unknown => {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error("expected a throw");
  };

  it("the duplicate-scalar rejection renders without the suffix", () => {
    // Both values ARE valid integers — the problem is duplication, and the
    // arity prose states it completely; "(expected integer)" would point at
    // the grammar, which is not what failed.
    const error = capture(() =>
      decodeSearch({ page: p.integer() }, new URLSearchParams("page=1&page=2")),
    );
    if (!(error instanceof SearchDecodeError)) throw new Error("wrong class");
    expect(error.message).toBe(
      "Failed to decode search params:\n" +
        "  ✖ page: received 2 values for a single-value param",
    );
  });

  it("a foreign-validator failure renders WITH the suffix", () => {
    // The validator's prose names neither the offending value nor the
    // grammar (the Zod-min-length shape of message), so the rendered line
    // must supply the expected label itself.
    const min3: StandardSchemaV1<string, string> = {
      "~standard": {
        validate: (value) =>
          typeof value === "string" && value.length >= 3
            ? { value }
            : { issues: [{ message: "too short" }] },
        vendor: "test",
        version: 1,
      },
    };
    const error = capture(() =>
      decodeSearch({ q: p.string(min3) }, { q: "ab" }),
    );
    if (!(error instanceof SearchDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "string",
        key: "q",
        message: "Schema validation failed: too short",
        reason: "validate",
        wire: "ab",
      },
    ]);
    expect(error.message).toBe(
      "Failed to decode search params:\n" +
        "  ✖ q: Schema validation failed: too short (expected string)",
    );
  });

  it("a core grammar failure keeps its self-describing message, no suffix", () => {
    // '"x" is not an integer' already quotes the value and names the
    // grammar; appending "(expected integer)" would be pure duplication.
    const error = capture(() =>
      decodeSearch({ page: p.integer() }, { page: "x" }),
    );
    if (!(error instanceof SearchDecodeError)) throw new Error("wrong class");
    expect(error.message).toBe(
      'Failed to decode search params:\n  ✖ page: "x" is not an integer',
    );
  });

  it("a params shape mismatch renders without the suffix", () => {
    // "expected a single segment value, got an array" states the problem
    // completely; the grammar label is not what failed.
    const route = defineAppRoute("/users/[id]", {
      params: { id: p.integer() },
    });
    const error = capture(() => decodeParams(route, { id: ["1", "2"] }));
    if (!(error instanceof ParamsDecodeError)) throw new Error("wrong class");
    expect(error.issues).toStrictEqual([
      {
        expected: "integer",
        key: "id",
        message: "expected a single segment value, got an array",
        reason: "shape",
      },
    ]);
    expect(error.message).not.toContain("(expected");
  });
});

describe("instanceof brand hardening", () => {
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
