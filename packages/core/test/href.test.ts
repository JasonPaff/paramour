import { describe, expect, it } from "vitest";

import {
  buildPath,
  decodeParams,
  defineAppRoute,
  definePagesRoute,
  encodeParams,
  encodeStaticParams,
  href,
  p,
  ParamourError,
  SerializeError,
} from "../src";

describe("href assembly", () => {
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

describe("trailingSlash: true (the R6 opt-in)", () => {
  it("ends every non-root path in a slash, before the query and hash", () => {
    const asset = defineAppRoute("/asset", {
      search: { name: p.string(), type: p.string() },
      trailingSlash: true,
    });
    expect(href(asset, { search: { name: "x", type: "skill" } })).toBe(
      "/asset/?name=x&type=skill",
    );
    expect(
      href(asset, { hash: "top", search: { name: "x", type: "skill" } }),
    ).toBe("/asset/?name=x&type=skill#top");
    const bundles = defineAppRoute("/bundles", { trailingSlash: true });
    expect(href(bundles)).toBe("/bundles/");
    expect(href(bundles, { hash: "top" })).toBe("/bundles/#top");
  });

  it("leaves the root as /, never //", () => {
    const root = defineAppRoute("/", { trailingSlash: true });
    expect(href(root)).toBe("/");
    expect(href(root, { hash: "top" })).toBe("/#top");
    // A root optional catch-all that elides is the root too.
    const site = defineAppRoute("/[[...slug]]", {
      params: { slug: p.string() },
      trailingSlash: true,
    });
    expect(href(site)).toBe("/");
    expect(href(site, { params: { slug: ["a", "b"] } })).toBe("/a/b/");
  });

  it("follows the last dynamic segment, single or catch-all", () => {
    const user = defineAppRoute("/user/[id]", {
      params: { id: p.integer() },
      trailingSlash: true,
    });
    expect(href(user, { params: { id: 42 } })).toBe("/user/42/");
    const files = defineAppRoute("/files/[...path]", {
      params: { path: p.string() },
      trailingSlash: true,
    });
    // An element's own "/" stays %2F (R2), so the slash is unambiguous.
    expect(href(files, { params: { path: ["a/b", "c"] } })).toBe(
      "/files/a%2Fb/c/",
    );
  });

  it("applies after an optional catch-all elides (R3)", () => {
    const docs = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
      trailingSlash: true,
    });
    expect(href(docs)).toBe("/docs/");
    expect(href(docs, { params: { slug: [] } })).toBe("/docs/");
    expect(href(docs, { params: { slug: ["a"] } })).toBe("/docs/a/");
  });

  it("buildPath agrees with href; the segment and static-params surfaces do not change", () => {
    const user = defineAppRoute("/user/[id]", {
      params: { id: p.string() },
      trailingSlash: true,
    });
    expect(buildPath(user, { id: "a b" })).toBe("/user/a%20b/");
    expect(encodeParams(user, { id: "a b" })).toEqual(["user", "a%20b"]);
    expect(encodeStaticParams(user, { id: "a b" })).toEqual({ id: "a b" });
  });

  it("works on pages routes too", () => {
    const product = definePagesRoute("/product/[id]", {
      params: { id: p.integer() },
      trailingSlash: true,
    });
    expect(href(product, { params: { id: 1 } })).toBe("/product/1/");
  });

  it("trailingSlash: false is the R6 default", () => {
    const about = defineAppRoute("/about", { trailingSlash: false });
    expect(href(about)).toBe("/about");
  });

  it("does not touch search encoding or param decoding", () => {
    const asset = defineAppRoute("/asset/[name]", {
      params: { name: p.string() },
      search: { file: p.string().optional() },
      trailingSlash: true,
    });
    expect(
      href(asset, {
        params: { name: "x" },
        search: { file: "references/web/overview.md" },
      }),
    ).toBe("/asset/x/?file=references%2Fweb%2Foverview.md");
    expect(decodeParams(asset, { name: "x" })).toEqual({ name: "x" });
  });

  it("rejects a non-boolean value from a plain-JS caller", () => {
    expect(() =>
      defineAppRoute("/about", { trailingSlash: "false" } as never),
    ).toThrow(/trailingSlash must be a boolean, got string/);
  });

  it("the path literal still may not end in a slash; the error points at the option", () => {
    expect(() => defineAppRoute("/asset/", {})).toThrow(
      /pass trailingSlash: true/,
    );
  });
});

describe("string-form href", () => {
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

  it("rejects a dynamic path — brackets need a route object", () => {
    for (const path of [
      "/product/[id]",
      "/files/[...path]",
      "/docs/[[...slug]]",
    ]) {
      expect(() => href(path)).toThrow(ParamourError);
      expect(() => href(path)).toThrow(/requires a static route path/);
    }
  });

  it("rejects a path that is not /-prefixed", () => {
    expect(() => href("about")).toThrow(ParamourError);
    expect(() => href("")).toThrow(ParamourError);
  });

  it("rejects query/hash smuggled into the path string", () => {
    expect(() => href("/about?q=1")).toThrow(ParamourError);
    expect(() => href("/about#top")).toThrow(ParamourError);
  });

  it("a JS caller passing params/search fails loud, not silently dropped", () => {
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
