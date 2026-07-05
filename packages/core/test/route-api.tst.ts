/**
 * Type-level tests for the route layer (design-03), world A: augmentation-free
 * pre-generation behavior. This file must NEVER gain a `declare module`
 * augmentation — module augmentation is program-global, so the registry
 * world (world B) lives in a separate tstyche target, or every fallback
 * assertion here silently flips (design-03 testing plan).
 */
import { expect, test } from "tstyche";

import { defineRoute, p } from "../src";
import type { AnyRoute, InferRouteParams } from "../src";

test("pre-generation fallback: any path literal is accepted and retained", () => {
  const route = defineRoute("/totally/made/up", {});
  expect(route.path).type.toBe<"/totally/made/up">();
});

test("segment extraction: single param (RL3)", () => {
  const route = defineRoute("/product/[id]", { params: { id: p.integer() } });
  expect<InferRouteParams<typeof route>>().type.toBe<{ id: number }>();
});

test("segment extraction: catch-all decodes element-wise to an array (RL3/D6)", () => {
  const route = defineRoute("/blog/[...slug]", {
    params: { slug: p.string() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{ slug: string[] }>();
});

test("segment extraction: optional catch-all output key is REQUIRED (RL3 ruling)", () => {
  // Absent normalizes to [] at decode time (D6), so the output side has no
  // `?:` split — a regression to `{ path?: string[] }` must fail toBe here.
  const route = defineRoute("/docs/[[...path]]", {
    params: { path: p.string() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{ path: string[] }>();
});

test("segment extraction: static path has no params", () => {
  const route = defineRoute("/about", {});
  expect<InferRouteParams<typeof route>>().type.toBe<{}>();
});

test("segment extraction: mixed static and dynamic segments", () => {
  const route = defineRoute("/org/[orgId]/repo/[repoId]", {
    params: { orgId: p.string(), repoId: p.integer() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{
    orgId: string;
    repoId: number;
  }>();
});

test("exact keys: excess and misspelled param keys are rejected (RL1)", () => {
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer(), extra: p.string() },
  });
  // Wrong casing is just an excess key plus a missing one.
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { productid: p.integer() },
  });
  // Catch-all keys must match the segment name exactly.
  expect(defineRoute).type.not.toBeCallableWith("/blog/[...slug]", {
    params: { slugs: p.string() },
  });
});

test("exact keys: a missing param key is rejected (RL1)", () => {
  expect(defineRoute).type.not.toBeCallableWith("/org/[orgId]/repo/[repoId]", {
    params: { orgId: p.string() },
  });
});

test("dynamic path requires params; static path rejects them (RL1)", () => {
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {});
  expect(defineRoute).type.not.toBeCallableWith("/", {
    params: { x: p.string() },
  });
  expect(defineRoute).type.not.toBeCallableWith("/about", {
    params: { x: p.string() },
  });
});

test("params reject presence-modified codecs; catch stays legal (D5)", () => {
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer().optional() },
  });
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer().default(1) },
  });
  // The params codec describes ONE segment element (D6); arrays come from
  // the segment kind, so arity-"many" codecs are rejected too.
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.stringArray() },
  });
  expect(defineRoute).type.toBeCallableWith("/files/[...seg]", {
    params: { seg: p.integer().catch(0) },
  });
});

test("const retention: enum literal unions survive into the route object", () => {
  const route = defineRoute("/items/[sort]", {
    params: { sort: p.enum(["price", "rating"]) },
  });
  expect(route["~params"].sort["~out"]).type.toBe<"price" | "rating">();
  expect<InferRouteParams<typeof route>>().type.toBe<{
    sort: "price" | "rating";
  }>();
});

test("search config is retained on the route object", () => {
  const route = defineRoute("/about", {
    search: { page: p.integer().default(1) },
  });
  expect(route["~search"].page["~presence"]).type.toBe<"defaulted">();
});

test("malformed bracket tokens fall through as static text (RL3)", () => {
  // No type-level path linting: these are static paths to the type layer
  // (tokenizePath rejects them at runtime), so an empty config typechecks.
  expect(defineRoute).type.toBeCallableWith("/x/[]", {});
  expect(defineRoute).type.toBeCallableWith("/x/[...]", {});
  expect(defineRoute).type.toBeCallableWith("/user/a[b]c", {});
});

test("concrete routes are assignable to AnyRoute (RL4 variance)", () => {
  const route = defineRoute("/product/[id]", {
    params: { id: p.integer() },
    search: { q: p.string() },
  });
  expect<typeof route>().type.toBeAssignableTo<AnyRoute>();
});
