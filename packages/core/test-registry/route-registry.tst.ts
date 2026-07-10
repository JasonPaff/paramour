/**
 * Type-level tests for the route layer (design-03/design-06), world B:
 * POST-generation behavior, with a hand-authored stand-in for the codegen
 * artifact. This target compiles in its own program (tstyche.registry.json)
 * because module augmentation is program-global — sharing a compilation unit
 * with route-api.tst.ts would silently flip every world-A fallback assertion.
 * Imports use the real "paramour" specifier (paths-mapped to src) so the
 * augmentation targets exactly the module identity the generated .d.ts will.
 */
import { expect, test } from "tstyche";

import {
  useRouteParams as useAppRouteParams,
  useRouteParamsOrThrow,
  useSearch as useAppSearch,
  useSearchOrThrow,
} from "@paramour-js/next/app";
import {
  useRouteParams as usePagesRouteParams,
  useSearch as usePagesSearch,
} from "@paramour-js/next/pages";
import { defineAppRoute, definePagesRoute, href, p } from "paramour";
import type { Href, InferRouteParams } from "paramour";

declare module "paramour" {
  interface ParamourRegister {
    appRoutes: "/" | "/about" | "/docs/[[...slug]]" | "/product/[id]";
    pagesRoutes: "/legacy" | "/legacy/[id]";
  }
}

test("registered path literals are accepted and retained, per router (RL8/PR9)", () => {
  const app = defineAppRoute("/about", {});
  expect(app.path).type.toBe<"/about">();
  const pages = definePagesRoute("/legacy", {});
  expect(pages.path).type.toBe<"/legacy">();
});

test("unregistered path literals are rejected — the world-A fallback is gone", () => {
  expect(defineAppRoute).type.not.toBeCallableWith("/totally/made/up", {});
  expect(definePagesRoute).type.not.toBeCallableWith("/totally/made/up", {});
  // Near-misses of registered paths are rejected too.
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[productId]", {
    params: { productId: p.integer() },
  });
});

test("cross-router paths are rejected both ways (PR9)", () => {
  // Each constructor sees ONLY its own registry member: a pages path handed
  // to defineAppRoute is exactly the wrong-router mistake the split exists
  // to catch, and vice versa.
  expect(defineAppRoute).type.not.toBeCallableWith("/legacy", {});
  expect(defineAppRoute).type.not.toBeCallableWith("/legacy/[id]", {
    params: { id: p.string() },
  });
  expect(definePagesRoute).type.not.toBeCallableWith("/about", {});
  expect(definePagesRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer() },
  });
});

test("method gating survives world B (PR3): parse* app-only, parseContext pages-only", () => {
  const app = defineAppRoute("/product/[id]", { params: { id: p.integer() } });
  const pages = definePagesRoute("/legacy/[id]", {
    params: { id: p.integer() },
  });
  expect(app).type.not.toHaveProperty("parseContext");
  expect(pages).type.not.toHaveProperty("parse");
  expect(pages).type.toHaveProperty("parseContext");
});

test("app hooks reject a pages route, in world B too (PR3, PR11 §3)", () => {
  // The hooks resolve through the BUILT d.ts (tsconfig paths), so this
  // certifies the gate as consumers see it, post declaration emit.
  const app = defineAppRoute("/product/[id]", { params: { id: p.integer() } });
  const pages = definePagesRoute("/legacy/[id]", {
    params: { id: p.integer() },
  });
  expect(useAppRouteParams).type.toBeCallableWith(app);
  expect(useAppSearch).type.toBeCallableWith(app);
  expect(useAppRouteParams).type.not.toBeCallableWith(pages);
  expect(useAppSearch).type.not.toBeCallableWith(pages);
  expect(useRouteParamsOrThrow).type.not.toBeCallableWith(pages);
  expect(useSearchOrThrow).type.not.toBeCallableWith(pages);
});

test("pages hooks reject an app route, in world B too (PR3, PR11 §3)", () => {
  const app = defineAppRoute("/product/[id]", { params: { id: p.integer() } });
  const pages = definePagesRoute("/legacy/[id]", {
    params: { id: p.integer() },
  });
  expect(usePagesRouteParams).type.toBeCallableWith(pages);
  expect(usePagesSearch).type.toBeCallableWith(pages);
  expect(usePagesRouteParams).type.not.toBeCallableWith(app);
  expect(usePagesSearch).type.not.toBeCallableWith(app);
});

test("param extraction still runs on the literal, not the registry (spike-01)", () => {
  const route = defineAppRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{ id: number }>();
  // Exact-key enforcement is unchanged post-generation, on both routers.
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { productid: p.integer() },
  });
  expect(definePagesRoute).type.not.toBeCallableWith("/legacy/[id]", {
    params: { productid: p.integer() },
  });
});

test("href narrows its brand to the registered literal for both routers (RL4/PR3)", () => {
  const product = defineAppRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(href(product, { params: { id: 1 } })).type.toBe<
    Href<"/product/[id]">
  >();
  const legacy = definePagesRoute("/legacy/[id]", {
    params: { id: p.integer() },
  });
  expect(href(legacy, { params: { id: 1 } })).type.toBe<Href<"/legacy/[id]">>();
  // Optional-catch-all-only routes stay bare-callable post-generation.
  const docs = defineAppRoute("/docs/[[...slug]]", {
    params: { slug: p.string() },
  });
  expect(href(docs)).type.toBe<Href<"/docs/[[...slug]]">>();
});
