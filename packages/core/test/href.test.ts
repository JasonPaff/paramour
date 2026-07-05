import { describe, expect, it } from "vitest";

import { defineRoute, href, p, ParamourError, SerializeError } from "../src";

describe("href assembly (RL4)", () => {
  it("assembles path, ?query, #hash in fixed order", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
      search: { q: p.string() },
    });
    expect(
      href(route, { hash: "reviews", params: { id: 42 }, search: { q: "a" } }),
    ).toBe("/product/42?q=a#reviews");
  });

  it("omits the query entirely when no pairs are emitted (S1)", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
      search: { q: p.string().optional() },
    });
    expect(href(route, { params: { id: 42 } })).toBe("/product/42");
  });

  it("the whole options argument is omittable on a static route", () => {
    const about = defineRoute("/about", {});
    expect(href(about)).toBe("/about");
    expect(href(about, {})).toBe("/about");
  });

  it("an optional-catch-all-only route is bare-callable (presence ruling)", () => {
    const docs = defineRoute("/docs/[[...path]]", {
      params: { path: p.string() },
    });
    expect(href(docs)).toBe("/docs");
    expect(href(docs, { params: { path: ["a", "b"] } })).toBe("/docs/a/b");
  });

  it("returns a primitive string — the brand is type-only", () => {
    const about = defineRoute("/about", {});
    expect(typeof href(about)).toBe("string");
  });

  it("emits only schema-declared search params (S9)", () => {
    const route = defineRoute("/about", { search: { q: p.string() } });
    expect(href(route, { search: { junk: "x", q: "a" } as never })).toBe(
      "/about?q=a",
    );
  });

  it("a JS caller omitting a required search half gets encodeSearch's error", () => {
    const route = defineRoute("/about", { search: { q: p.string() } });
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

describe("hash emission (S10)", () => {
  const about = defineRoute("/about", {});

  it("comes only from the explicit caller option", () => {
    expect(href(about, { hash: "top" })).toBe("/about#top");
  });

  it("the empty string emits no #", () => {
    expect(href(about, { hash: "" })).toBe("/about");
  });

  it("is appended verbatim — no encoding, the caller owns escaping", () => {
    expect(href(about, { hash: "a b/c?d" })).toBe("/about#a b/c?d");
  });

  it("verbatim means verbatim: a leading # yields ##", () => {
    expect(href(about, { hash: "#top" })).toBe("/about##top");
  });
});
