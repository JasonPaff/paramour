import { defineAppRoute, p } from "paramour";
import { describe, expect, it } from "vitest";

import { matchesPathname } from "../src/match.js";

const cafeSegments = defineAppRoute("/café", {})["~segments"];
const docsSegments = defineAppRoute("/docs/[[...path]]", {
  params: { path: p.string() },
})["~segments"];
const filesSegments = defineAppRoute("/files/[...slug]", {
  params: { slug: p.string() },
})["~segments"];
const productSegments = defineAppRoute("/product/[id]", {
  params: { id: p.string() },
})["~segments"];
const shopDealsSegments = defineAppRoute("/shop/deals", {})["~segments"];
const shopSegments = defineAppRoute("/shop", {})["~segments"];

describe("matchesPathname (DT10 current-URL derivation)", () => {
  it("static segments match exactly", () => {
    expect(matchesPathname(shopDealsSegments, "/shop/deals")).toBe(true);
    expect(matchesPathname(shopDealsSegments, "/shop")).toBe(false);
    expect(matchesPathname(shopDealsSegments, "/shop/deals/extra")).toBe(false);
  });

  it("[id] consumes exactly one segment", () => {
    expect(matchesPathname(productSegments, "/product/42")).toBe(true);
    expect(matchesPathname(productSegments, "/product")).toBe(false);
    expect(matchesPathname(productSegments, "/product/42/reviews")).toBe(false);
  });

  it("[...slug] consumes one-plus segments", () => {
    expect(matchesPathname(filesSegments, "/files/a")).toBe(true);
    expect(matchesPathname(filesSegments, "/files/a/b/c")).toBe(true);
    expect(matchesPathname(filesSegments, "/files")).toBe(false);
  });

  it("[[...path]] consumes zero-plus segments", () => {
    expect(matchesPathname(docsSegments, "/docs")).toBe(true);
    expect(matchesPathname(docsSegments, "/docs/a/b")).toBe(true);
    expect(matchesPathname(docsSegments, "/blog")).toBe(false);
  });

  it("trailing slashes are normalization noise", () => {
    expect(matchesPathname(shopSegments, "/shop/")).toBe(true);
  });

  it("static comparison percent-decodes the path part", () => {
    expect(matchesPathname(cafeSegments, "/caf%C3%A9")).toBe(true);
    // A malformed escape must not throw — it just doesn't match.
    expect(matchesPathname(cafeSegments, "/caf%ZZ")).toBe(false);
  });
});
