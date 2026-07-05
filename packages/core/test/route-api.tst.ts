/**
 * Type-level tests for the route layer (design-03), world A: augmentation-free
 * pre-generation behavior. This file must NEVER gain a `declare module`
 * augmentation — module augmentation is program-global, so the registry
 * world (world B) lives in a separate tstyche target, or every fallback
 * assertion here silently flips (design-03 testing plan).
 */
import { expect, test } from "tstyche";

import { defineRoute, href, p } from "../src";
import type {
  AnyRoute,
  Href,
  InferRouteParams,
  ParamsProps,
  RouteDecodeError,
  RouteProps,
  SafeResult,
} from "../src";

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

test("parse methods: full parse returns { params; search } (RL6)", () => {
  const route = defineRoute("/product/[id]", {
    params: { id: p.integer() },
    search: { q: p.string().optional() },
  });
  // The search half's keys are READONLY: `SC` is const-inferred (RL1) and
  // InferSearchOutput is homomorphic, so the config's readonly keys survive
  // into the output. ParamsOutput maps over PathParamNames (non-homomorphic),
  // so the params half carries no modifiers.
  expect(route.parse({})).type.toBe<
    Promise<{
      params: { id: number };
      search: { readonly q: string | undefined };
    }>
  >();
  expect(route.safeParse({})).type.toBe<
    Promise<
      SafeResult<{
        params: { id: number };
        search: { readonly q: string | undefined };
      }>
    >
  >();
});

test("parse methods: bare-surface results carry no wrapper (RL6)", () => {
  const route = defineRoute("/product/[id]", {
    params: { id: p.integer() },
    search: { q: p.string().optional() },
  });
  expect(route.parseParams({})).type.toBe<Promise<{ id: number }>>();
  expect(route.safeParseParams({})).type.toBe<
    Promise<SafeResult<{ id: number }>>
  >();
  // readonly per the const-inferred SC (see the note in the previous test).
  expect(route.parseSearch({})).type.toBe<
    Promise<{ readonly q: string | undefined }>
  >();
  expect(route.safeParseSearch({})).type.toBe<
    Promise<SafeResult<{ readonly q: string | undefined }>>
  >();
});

test("props are structural and MaybePromise-valued (RL6)", () => {
  interface NextStylePageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
  expect<NextStylePageProps>().type.toBeAssignableTo<RouteProps>();
  // Plain objects (tests, other frameworks) and absent members work too.
  expect<{ params: { id: string } }>().type.toBeAssignableTo<RouteProps>();
  expect<Record<never, never>>().type.toBeAssignableTo<RouteProps>();
  // Layout props (no searchParams member) satisfy the params surface.
  expect<{
    params: Promise<{ slug: string[] }>;
  }>().type.toBeAssignableTo<ParamsProps>();
});

test("SafeResult: if (result.error) narrows both arms (RL6)", () => {
  const result = {} as SafeResult<{ id: number }>;
  if (result.error) {
    expect(result.error).type.toBe<RouteDecodeError>();
    expect(result.data).type.toBe<undefined>();
  } else {
    expect(result.data).type.toBe<{ id: number }>();
  }
});

test("href: branded return — assignable to string, never from it (RL4)", () => {
  const about = defineRoute("/about", {});
  expect(href(about)).type.toBe<Href<"/about">>();
  expect<Href<"/about">>().type.toBeAssignableTo<string>();
  expect<string>().type.not.toBeAssignableTo<Href>();
  // Route-narrowed acceptance (RL10.6 substrate): brands don't cross paths.
  expect<Href<"/a">>().type.not.toBeAssignableTo<Href<"/b">>();
});

test("href: the whole options argument is omittable only when nothing is required (RL4)", () => {
  const about = defineRoute("/about", {});
  expect(href).type.toBeCallableWith(about);
  expect(href).type.toBeCallableWith(about, {});
  expect(href).type.toBeCallableWith(about, { hash: "top" });

  const product = defineRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(href).type.not.toBeCallableWith(product);
  expect(href).type.not.toBeCallableWith(product, {});
  expect(href).type.toBeCallableWith(product, { params: { id: 1 } });
  // The input side is the codec's Out type — no stringly-typed params.
  expect(href).type.not.toBeCallableWith(product, { params: { id: "1" } });
});

test("href: params omission is presence-driven (2026-07-04 ruling)", () => {
  // An optional-catch-all-only route has no required param key, so the
  // params property — and the whole options argument — may be omitted.
  const docs = defineRoute("/docs/[[...path]]", {
    params: { path: p.string() },
  });
  expect(href).type.toBeCallableWith(docs);
  expect(href).type.toBeCallableWith(docs, { params: {} });
  expect(href).type.toBeCallableWith(docs, { params: { path: ["a"] } });

  // A required catch-all keeps params required.
  const files = defineRoute("/files/[...seg]", {
    params: { seg: p.string() },
  });
  expect(href).type.not.toBeCallableWith(files);
  expect(href).type.toBeCallableWith(files, { params: { seg: ["a"] } });
});

test("href: search property required iff a required key exists (RL4/D4)", () => {
  const strict = defineRoute("/s", { search: { q: p.string() } });
  expect(href).type.not.toBeCallableWith(strict);
  expect(href).type.not.toBeCallableWith(strict, {});
  expect(href).type.toBeCallableWith(strict, { search: { q: "x" } });

  const lax = defineRoute("/l", { search: { page: p.integer().default(1) } });
  expect(href).type.toBeCallableWith(lax);
  expect(href).type.toBeCallableWith(lax, { search: {} });
  expect(href).type.toBeCallableWith(lax, { search: { page: 2 } });
});

test("href: an empty-input half bans its property outright (2026-07-04 ruling)", () => {
  // The bare Partial<Record<Key, {}>> form would accept arbitrary junk on
  // static/empty-config routes — the empty object type is exempt from
  // excess-property checking — and silently drop it from the link.
  const about = defineRoute("/about", {});
  expect(href).type.toBeCallableWith(about);
  expect(href).type.toBeCallableWith(about, {});
  expect(href).type.toBeCallableWith(about, { hash: "top" });
  expect(href).type.not.toBeCallableWith(about, { search: { q: "x" } });
  expect(href).type.not.toBeCallableWith(about, { params: { id: 42 } });
  // ?: never mirrors RouteConfig's static-path stance: present-but-empty is
  // rejected too, and so are non-fresh objects (no excess-property reliance).
  expect(href).type.not.toBeCallableWith(about, { params: {} });
  expect(href).type.not.toBeCallableWith(about, { search: {} });
  const junk = { q: "x" };
  expect(href).type.not.toBeCallableWith(about, { search: junk });

  // A dynamic route with no search config bans the search half the same way.
  const product = defineRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(href).type.not.toBeCallableWith(product, {
    params: { id: 1 },
    search: { q: "x" },
  });
});
