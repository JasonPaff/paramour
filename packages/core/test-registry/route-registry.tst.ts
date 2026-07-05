/**
 * Type-level tests for the route layer (design-03), world B: POST-generation
 * behavior, with a hand-authored stand-in for the codegen artifact. This
 * target compiles in its own program (tstyche.registry.json) because module
 * augmentation is program-global — sharing a compilation unit with
 * route-api.tst.ts would silently flip every world-A fallback assertion.
 * Imports use the real "paramour" specifier (paths-mapped to src) so the
 * augmentation targets exactly the module identity the generated .d.ts will.
 */
import { expect, test } from "tstyche";

import { defineRoute, href, p } from "paramour";
import type { Href, InferRouteParams } from "paramour";

declare module "paramour" {
  interface ParamourRegister {
    routes: "/" | "/about" | "/docs/[[...path]]" | "/product/[id]";
  }
}

test("registered path literals are accepted and retained (RL8)", () => {
  const route = defineRoute("/about", {});
  expect(route.path).type.toBe<"/about">();
});

test("unregistered path literals are rejected — the world-A fallback is gone", () => {
  expect(defineRoute).type.not.toBeCallableWith("/totally/made/up", {});
  // Near-misses of registered paths are rejected too.
  expect(defineRoute).type.not.toBeCallableWith("/product/[productId]", {
    params: { productId: p.integer() },
  });
});

test("param extraction still runs on the literal, not the registry (spike-01)", () => {
  const route = defineRoute("/product/[id]", { params: { id: p.integer() } });
  expect<InferRouteParams<typeof route>>().type.toBe<{ id: number }>();
  // Exact-key enforcement is unchanged post-generation.
  expect(defineRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { productid: p.integer() },
  });
});

test("href narrows its brand to the registered literal (RL4)", () => {
  const product = defineRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(href(product, { params: { id: 1 } })).type.toBe<
    Href<"/product/[id]">
  >();
  // Optional-catch-all-only routes stay bare-callable post-generation.
  const docs = defineRoute("/docs/[[...path]]", {
    params: { path: p.string() },
  });
  expect(href(docs)).type.toBe<Href<"/docs/[[...path]]">>();
});
