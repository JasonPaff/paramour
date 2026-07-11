import { describe, expect, it } from "vitest";

import { defineAppRoute, href, p, ParamourError, SerializeError } from "../src";

describe("href assembly (RL4)", () => {
  it("assembles path, ?query, #hash in fixed order", () => {
    const route = defineAppRoute("/product/[id]", {
      params: { id: p.integer() },
      search: { q: p.string() },
    });
    expect(
      href(route, { hash: "reviews", params: { id: 42 }, search: { q: "a" } }),
    ).toBe("/product/42?q=a#reviews");
  });

  it("omits the query entirely when no pairs are emitted (S1)", () => {
    const route = defineAppRoute("/product/[id]", {
      params: { id: p.integer() },
      search: { q: p.string().optional() },
    });
    expect(href(route, { params: { id: 42 } })).toBe("/product/42");
  });

  it("the whole options argument is omittable on a static route", () => {
    const about = defineAppRoute("/about", {});
    expect(href(about)).toBe("/about");
    expect(href(about, {})).toBe("/about");
  });

  it("an optional-catch-all-only route is bare-callable (presence ruling)", () => {
    const docs = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    expect(href(docs)).toBe("/docs");
    expect(href(docs, { params: { slug: ["a", "b"] } })).toBe("/docs/a/b");
  });

  it("returns a primitive string — the brand is type-only", () => {
    const about = defineAppRoute("/about", {});
    expect(typeof href(about)).toBe("string");
  });

  it('the root route builds "/" (R6: no trailing-slash games)', () => {
    const root = defineAppRoute("/", {});
    expect(href(root)).toBe("/");
    expect(href(root, { hash: "top" })).toBe("/#top");
  });

  it("R6: no href ever gains a trailing slash", () => {
    const route = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
      search: { q: p.string().optional() },
    });
    for (const link of [
      href(route),
      href(route, { params: { slug: ["a"] } }),
      href(route, { params: { slug: ["a"] }, search: { q: "x" } }),
    ]) {
      expect(link === "/" || !link.split("?")[0]?.endsWith("/")).toBe(true);
    }
  });

  it("emits only schema-declared search params (S9)", () => {
    const route = defineAppRoute("/about", { search: { q: p.string() } });
    expect(href(route, { search: { junk: "x", q: "a" } as never })).toBe(
      "/about?q=a",
    );
  });

  it("a JS caller omitting a required search half gets encodeSearch's error", () => {
    const route = defineAppRoute("/about", { search: { q: p.string() } });
    expect(() => (href as (r: unknown) => string)(route)).toThrow(
      SerializeError,
    );
    expect(() => (href as (r: unknown) => string)(route)).toThrow(
      /required search param "q" is missing/,
    );
  });

  it("a hand-built route missing ~search fails branded, not with a TypeError", () => {
    // A static path sails through buildPath (no codec lookups), so the
    // missing-config chokepoint is encodeSearch's own guard.
    expect(() => (href as (r: unknown) => string)({ path: "/about" })).toThrow(
      ParamourError,
    );
    expect(() => (href as (r: unknown) => string)({ path: "/about" })).toThrow(
      /search config must be an object, got undefined/,
    );
  });
});

describe("string-form href (SH1)", () => {
  it("builds the bare path — same output as a route object would", () => {
    expect(href("/about")).toBe("/about");
    expect(href("/")).toBe("/");
  });

  it("assembles the hash with S10 semantics", () => {
    expect(href("/about", { hash: "team" })).toBe("/about#team");
    expect(href("/about", { hash: "" })).toBe("/about");
    expect(href("/", { hash: "top" })).toBe("/#top");
    // Verbatim, caller owns escaping — same as the route-object form.
    expect(href("/about", { hash: "#top" })).toBe("/about##top");
  });

  it("returns a primitive string — the brand is type-only", () => {
    expect(typeof href("/about")).toBe("string");
  });

  it("SH6: rejects a dynamic path — brackets need a route object", () => {
    for (const path of [
      "/product/[id]",
      "/files/[...path]",
      "/docs/[[...slug]]",
    ]) {
      expect(() => href(path)).toThrow(ParamourError);
      expect(() => href(path)).toThrow(/requires a static route path/);
    }
  });

  it("SH6: rejects a path that is not /-prefixed", () => {
    expect(() => href("about")).toThrow(ParamourError);
    expect(() => href("")).toThrow(ParamourError);
  });

  it("SH6: rejects query/hash smuggled into the path string", () => {
    expect(() => href("/about?q=1")).toThrow(ParamourError);
    expect(() => href("/about#top")).toThrow(ParamourError);
  });

  it("SH6: a JS caller passing params/search fails loud, not silently dropped", () => {
    const stringHref = href as (path: string, options?: unknown) => string;
    expect(() => stringHref("/about", { search: { q: "x" } })).toThrow(
      ParamourError,
    );
    expect(() => stringHref("/about", { params: { id: 1 } })).toThrow(
      /takes no params\/search/,
    );
    // Explicit undefined means absent (the plain-JS caller shape).
    expect(stringHref("/about", { search: undefined })).toBe("/about");
  });
});

describe("hash emission (S10)", () => {
  const about = defineAppRoute("/about", {});

  it("comes only from the explicit caller option", () => {
    expect(href(about, { hash: "top" })).toBe("/about#top");
  });

  it("the empty string emits no #", () => {
    expect(href(about, { hash: "" })).toBe("/about");
  });

  it("an explicit undefined emits no # either (plain-JS caller shape)", () => {
    // exactOptionalPropertyTypes bans this spelling in TS; a JS caller can
    // still pass it, and it must mean "absent".
    expect(href(about, { hash: undefined } as never)).toBe("/about");
  });

  it("is appended verbatim — no encoding, the caller owns escaping", () => {
    expect(href(about, { hash: "a b/c?d" })).toBe("/about#a b/c?d");
  });

  it("verbatim means verbatim: a leading # yields ##", () => {
    expect(href(about, { hash: "#top" })).toBe("/about##top");
  });
});
