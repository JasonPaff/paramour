/**
 * Type-level tests for the route layer (design-03), world A: augmentation-free
 * pre-generation behavior. This file must NEVER gain a `declare module`
 * augmentation — module augmentation is program-global, so the registry
 * world (world B) lives in a separate tstyche target, or every fallback
 * assertion here silently flips (design-03 testing plan).
 */
import { expect, test } from "tstyche";
import { z } from "zod";

import {
  defineAppRoute,
  definePagesRoute,
  encodeStaticParams,
  href,
  p,
  rawSearch,
} from "../src";
import type {
  AnyAppRoute,
  AnyPagesRoute,
  AnyRoute,
  Href,
  InferRouteParams,
  InferStaticParams,
  PagesContext,
  ParamsProps,
  RegisteredStaticRoutePaths,
  RouteDecodeError,
  RouteProps,
  SafeResult,
} from "../src";

test("pre-generation fallback: any path literal is accepted and retained", () => {
  const route = defineAppRoute("/totally/made/up", {});
  expect(route.path).type.toBe<"/totally/made/up">();
});

test("segment extraction: single param (RL3)", () => {
  const route = defineAppRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{ id: number }>();
});

test("segment extraction: catch-all decodes element-wise to an array (RL3/D6)", () => {
  const route = defineAppRoute("/blog/[...slug]", {
    params: { slug: p.string() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{ slug: string[] }>();
});

test("segment extraction: optional catch-all output key is REQUIRED (RL3 ruling)", () => {
  // Absent normalizes to [] at decode time (D6), so the output side has no
  // `?:` split — a regression to `{ slug?: string[] }` must fail toBe here.
  const route = defineAppRoute("/docs/[[...slug]]", {
    params: { slug: p.string() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{ slug: string[] }>();
});

test("segment extraction: static path has no params", () => {
  const route = defineAppRoute("/about", {});
  expect<InferRouteParams<typeof route>>().type.toBe<{}>();
});

test("segment extraction: mixed static and dynamic segments", () => {
  const route = defineAppRoute("/org/[orgId]/repo/[repoId]", {
    params: { orgId: p.string(), repoId: p.integer() },
  });
  expect<InferRouteParams<typeof route>>().type.toBe<{
    orgId: string;
    repoId: number;
  }>();
});

test("exact keys: excess and misspelled param keys are rejected (RL1)", () => {
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer(), extra: p.string() },
  });
  // Wrong casing is just an excess key plus a missing one.
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { productid: p.integer() },
  });
  // Catch-all keys must match the segment name exactly.
  expect(defineAppRoute).type.not.toBeCallableWith("/blog/[...slug]", {
    params: { slugs: p.string() },
  });
});

test("exact keys: a missing param key is rejected (RL1)", () => {
  expect(defineAppRoute).type.not.toBeCallableWith(
    "/org/[orgId]/repo/[repoId]",
    {
      params: { orgId: p.string() },
    },
  );
});

test("dynamic path requires params; static path rejects them (RL1)", () => {
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {});
  expect(defineAppRoute).type.not.toBeCallableWith("/", {
    params: { x: p.string() },
  });
  expect(defineAppRoute).type.not.toBeCallableWith("/about", {
    params: { x: p.string() },
  });
});

test("params reject presence-modified codecs; catch stays legal (D5)", () => {
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer().optional() },
  });
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.integer().default(1) },
  });
  // The params codec describes ONE segment element (D6); arrays come from
  // the segment kind, so arity-"many" codecs are rejected too.
  expect(defineAppRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.array() },
  });
  expect(defineAppRoute).type.toBeCallableWith("/files/[...seg]", {
    params: { seg: p.integer().catch(0) },
  });
});

test("const retention: enum literal unions survive into the route object", () => {
  const route = defineAppRoute("/items/[sort]", {
    params: { sort: p.enum(["price", "rating"]) },
  });
  expect(route["~params"].sort["~out"]).type.toBe<"price" | "rating">();
  expect<InferRouteParams<typeof route>>().type.toBe<{
    sort: "price" | "rating";
  }>();
});

test("search config is retained on the route object", () => {
  const route = defineAppRoute("/about", {
    search: { page: p.integer().default(1) },
  });
  expect(route["~search"].page["~presence"]).type.toBe<"defaulted">();
});

test("rawSearch: schema output flows into parse/parseSearch/safeParse* (design-04 SS6)", () => {
  const schema = z.object({ page: z.coerce.number() });
  const route = defineAppRoute("/about", { search: rawSearch(schema) });
  expect(route.parseSearch({})).type.toBe<Promise<{ page: number }>>();
  expect(route.safeParseSearch({})).type.toBe<
    Promise<SafeResult<{ page: number }>>
  >();
  expect(route.parse({})).type.toBe<
    Promise<{ params: {}; search: { page: number } }>
  >();
  expect(route.safeParse({})).type.toBe<
    Promise<SafeResult<{ params: {}; search: { page: number } }>>
  >();
});

test("rawSearch: href's search input is the raw wire record, not the schema output (SS5)", () => {
  const schema = z.object({ page: z.coerce.number() });
  const route = defineAppRoute("/about", { search: rawSearch(schema) });
  expect(href).type.toBeCallableWith(route, {
    search: { page: "1" },
  });
  expect(href).type.toBeCallableWith(route, {
    search: { tags: ["a", "b"] },
  });
  // The schema's OUTPUT type (a number) is not accepted on the encode side —
  // encode input is always wire-shaped strings, never the decode output.
  expect(href).type.not.toBeCallableWith(route, {
    search: { page: 1 },
  });
});

test("rawSearch: a codec-map route and a rawSearch route don't cross-contaminate through href/parse", () => {
  const codecRoute = defineAppRoute("/s", { search: { q: p.string() } });
  const rawRoute = defineAppRoute("/r", {
    search: rawSearch(z.object({ q: z.string() })),
  });
  expect(href).type.toBeCallableWith(codecRoute, { search: { q: "x" } });
  expect(href).type.not.toBeCallableWith(codecRoute, {
    search: { q: ["x"] },
  });
  expect(href).type.toBeCallableWith(rawRoute, { search: { q: "x" } });
  expect(href).type.toBeCallableWith(rawRoute, { search: { q: ["x"] } });
  // readonly per the const-inferred SC (see the note above on parse methods).
  expect(codecRoute.parseSearch({})).type.toBe<
    Promise<{ readonly q: string }>
  >();
  expect(rawRoute.parseSearch({})).type.toBe<Promise<{ q: string }>>();
});

test("rawSearch: a non-Standard-Schema argument is a compile error", () => {
  expect(rawSearch).type.not.toBeCallableWith({ notASchema: true });
  expect(rawSearch).type.not.toBeCallableWith("nope");
});

test("rawSearch composes with required params (all prior coverage is static-path)", () => {
  const route = defineAppRoute("/shop/[id]", {
    params: { id: p.integer() },
    search: rawSearch(z.object({ q: z.string() })),
  });
  // Both halves keep their own contract: typed params, raw wire search.
  expect(href).type.toBeCallableWith(route, {
    params: { id: 1 },
    search: { q: "x" },
  });
  expect(href).type.not.toBeCallableWith(route, { search: { q: "x" } });
  expect(href).type.not.toBeCallableWith(route, {
    params: { id: "1" },
    search: { q: "x" },
  });
  expect(route.parse({})).type.toBe<
    Promise<{ params: { id: number }; search: { q: string } }>
  >();
});

test("malformed bracket tokens fall through as static text (RL3)", () => {
  // No type-level path linting: these are static paths to the type layer
  // (tokenizePath rejects them at runtime), so an empty config typechecks.
  expect(defineAppRoute).type.toBeCallableWith("/x/[]", {});
  expect(defineAppRoute).type.toBeCallableWith("/x/[...]", {});
  expect(defineAppRoute).type.toBeCallableWith("/user/a[b]c", {});
});

test("concrete routes are assignable to AnyRoute (RL4 variance)", () => {
  const route = defineAppRoute("/product/[id]", {
    params: { id: p.integer() },
    search: { q: p.string() },
  });
  expect<typeof route>().type.toBeAssignableTo<AnyRoute>();
});

test("parse methods: full parse returns { params; search } (RL6)", () => {
  const route = defineAppRoute("/product/[id]", {
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
  const route = defineAppRoute("/product/[id]", {
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

test("SafeResult: the status discriminant narrows both arms (RL6, PR12)", () => {
  const result = {} as SafeResult<{ id: number }>;
  if (result.status === "error") {
    expect(result.error).type.toBe<RouteDecodeError>();
    // The success payload does not exist on the error arm at all.
    expect(result).type.not.toHaveProperty("data");
  } else {
    expect(result.status).type.toBe<"success">();
    expect(result.data).type.toBe<{ id: number }>();
    expect(result).type.not.toHaveProperty("error");
  }
});

test("href: branded return — assignable to string, never from it (RL4)", () => {
  const about = defineAppRoute("/about", {});
  expect(href(about)).type.toBe<Href<"/about">>();
  expect<Href<"/about">>().type.toBeAssignableTo<string>();
  expect<string>().type.not.toBeAssignableTo<Href>();
  // Route-narrowed acceptance (RL10.6 substrate): brands don't cross paths.
  expect<Href<"/a">>().type.not.toBeAssignableTo<Href<"/b">>();
});

test("href: the whole options argument is omittable only when nothing is required (RL4)", () => {
  const about = defineAppRoute("/about", {});
  expect(href).type.toBeCallableWith(about);
  expect(href).type.toBeCallableWith(about, {});
  expect(href).type.toBeCallableWith(about, { hash: "top" });

  const product = defineAppRoute("/product/[id]", {
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
  const docs = defineAppRoute("/docs/[[...slug]]", {
    params: { slug: p.string() },
  });
  expect(href).type.toBeCallableWith(docs);
  expect(href).type.toBeCallableWith(docs, { params: {} });
  expect(href).type.toBeCallableWith(docs, { params: { slug: ["a"] } });

  // A required catch-all keeps params required.
  const files = defineAppRoute("/files/[...seg]", {
    params: { seg: p.string() },
  });
  expect(href).type.not.toBeCallableWith(files);
  expect(href).type.toBeCallableWith(files, { params: { seg: ["a"] } });
});

test("href: search property required iff a required key exists (RL4/D4)", () => {
  const strict = defineAppRoute("/s", { search: { q: p.string() } });
  expect(href).type.not.toBeCallableWith(strict);
  expect(href).type.not.toBeCallableWith(strict, {});
  expect(href).type.toBeCallableWith(strict, { search: { q: "x" } });

  const lax = defineAppRoute("/l", {
    search: { page: p.integer().default(1) },
  });
  expect(href).type.toBeCallableWith(lax);
  expect(href).type.toBeCallableWith(lax, { search: {} });
  expect(href).type.toBeCallableWith(lax, { search: { page: 2 } });
});

test("href: an empty-input half bans its property outright (2026-07-04 ruling)", () => {
  // The bare Partial<Record<Key, {}>> form would accept arbitrary junk on
  // static/empty-config routes — the empty object type is exempt from
  // excess-property checking — and silently drop it from the link.
  const about = defineAppRoute("/about", {});
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
  const product = defineAppRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(href).type.not.toBeCallableWith(product, {
    params: { id: 1 },
    search: { q: "x" },
  });
});

test("href: string form accepts any string pre-generation, branded like the route form (SH1/SH5)", () => {
  // World A: no registry members, so the static union falls back to `string`
  // — the same documented unverified stance as the constructors (RL8). The
  // SH6 runtime guard is the world-A backstop.
  expect<RegisteredStaticRoutePaths>().type.toBe<string>();
  expect(href).type.toBeCallableWith("/totally/unverified");
  // The literal is retained into the brand — identical to what
  // href(defineAppRoute("/about", {})) produces.
  expect(href("/about")).type.toBe<Href<"/about">>();
  expect(href("/about", { hash: "team" })).type.toBe<Href<"/about">>();
});

test("href: string form is hash-only — no params/search side door (SH4)", () => {
  expect(href).type.toBeCallableWith("/about");
  expect(href).type.toBeCallableWith("/about", {});
  expect(href).type.toBeCallableWith("/about", { hash: "team" });
  // ?: never bans both halves outright — present-but-empty and non-fresh
  // objects included (same stance as the 2026-07-04 empty-input ruling).
  expect(href).type.not.toBeCallableWith("/about", { search: { q: "x" } });
  expect(href).type.not.toBeCallableWith("/about", { params: { id: 1 } });
  expect(href).type.not.toBeCallableWith("/about", { params: {} });
  expect(href).type.not.toBeCallableWith("/about", { search: {} });
  const junk = { search: { q: "x" } };
  expect(href).type.not.toBeCallableWith("/about", junk);
});

test("router brand: the constructors declare distinct brands (PR3/PR7)", () => {
  const app = defineAppRoute("/about", {});
  const pages = definePagesRoute("/about", {});
  expect(app["~router"]).type.toBe<"app">();
  expect(pages["~router"]).type.toBe<"pages">();
  expect<typeof app>().type.toBeAssignableTo<AnyAppRoute>();
  expect<typeof pages>().type.toBeAssignableTo<AnyPagesRoute>();
  // The brand is what makes a cross-router hand-off a compile error.
  expect<typeof app>().type.not.toBeAssignableTo<AnyPagesRoute>();
  expect<typeof pages>().type.not.toBeAssignableTo<AnyAppRoute>();
  // Both stay router-agnostic AnyRoutes — href's and the decoders' bound.
  expect<typeof app>().type.toBeAssignableTo<AnyRoute>();
  expect<typeof pages>().type.toBeAssignableTo<AnyRoute>();
});

test("method gating (PR3): the wrong router's surface is ABSENT, not just ill-typed", () => {
  const app = defineAppRoute("/product/[id]", { params: { id: p.integer() } });
  const pages = definePagesRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(app).type.not.toHaveProperty("parseContext");
  expect(app).type.not.toHaveProperty("safeParseContext");
  expect(pages).type.not.toHaveProperty("parse");
  expect(pages).type.not.toHaveProperty("parseParams");
  expect(pages).type.not.toHaveProperty("parseSearch");
  expect(pages).type.not.toHaveProperty("safeParse");
  expect(pages).type.not.toHaveProperty("safeParseParams");
  expect(pages).type.not.toHaveProperty("safeParseSearch");
});

test("pages routes share the world-A fallback and the param machinery (PR7)", () => {
  const pages = definePagesRoute("/totally/made/up", {});
  expect(pages.path).type.toBe<"/totally/made/up">();
  const legacy = definePagesRoute("/legacy/[slug]", {
    params: { slug: p.string() },
  });
  expect<InferRouteParams<typeof legacy>>().type.toBe<{ slug: string }>();
  // RL1 exact keys and the dynamic-path params requirement apply unchanged.
  expect(definePagesRoute).type.not.toBeCallableWith("/legacy/[slug]", {});
  expect(definePagesRoute).type.not.toBeCallableWith("/legacy/[slug]", {
    params: { slugs: p.string() },
  });
});

test("parseContext: sync, typed halves (PR10)", () => {
  const pages = definePagesRoute("/product/[id]", {
    params: { id: p.integer() },
    search: { q: p.string().optional() },
  });
  // Synchronous — no Promise wrapper anywhere on the pages surface.
  expect(pages.parseContext({ query: {} })).type.toBe<{
    params: { id: number };
    search: { readonly q: string | undefined };
  }>();
  expect(pages.safeParseContext({ query: {} })).type.toBe<
    SafeResult<{
      params: { id: number };
      search: { readonly q: string | undefined };
    }>
  >();
});

test("parseContext rejects a query-less GetStaticPropsContext shape (PR10)", () => {
  const pages = definePagesRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  // getStaticProps has no query string; typed search there would be a lie.
  expect(pages.parseContext).type.not.toBeCallableWith({
    params: { id: "1" },
  });
  expect(pages.parseContext).type.toBeCallableWith({ query: {} });
  expect(pages.parseContext).type.toBeCallableWith({
    params: { id: "1" },
    query: { id: "1" },
  });
  // The getInitialProps shape (query, no params) composes too.
  expect<{
    query: Record<string, string | string[] | undefined>;
  }>().type.toBeAssignableTo<PagesContext>();
});

test("search ∩ params: a shadowing key fails on pages, is allowed on app (PR9)", () => {
  // router.query merges the halves with the route param winning — a pages
  // search codec at a param name could never receive a value.
  expect(definePagesRoute).type.not.toBeCallableWith("/product/[id]", {
    params: { id: p.string() },
    search: { id: p.string() },
  });
  // App sources are separate (useParams vs useSearchParams), so ?id= on
  // /product/[id] is well-defined there.
  expect(defineAppRoute).type.toBeCallableWith("/product/[id]", {
    params: { id: p.string() },
    search: { id: p.string() },
  });
  // Non-shadowing pages search keys stay legal.
  expect(definePagesRoute).type.toBeCallableWith("/product/[id]", {
    params: { id: p.string() },
    search: { q: p.string().optional() },
  });
});

test("href accepts both routers (PR3 — href stays router-agnostic)", () => {
  const pages = definePagesRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(href(pages, { params: { id: 1 } })).type.toBe<Href<"/product/[id]">>();
});

test("encodeStaticParams: wire-string record typed per segment kind", () => {
  // The return is a three-way mapped intersection (like InferParamsInput),
  // so assert assignability both ways rather than identity-sensitive toBe.
  const single = defineAppRoute("/product/[id]", {
    params: { id: p.integer() },
  });
  expect(encodeStaticParams(single, { id: 1 })).type.toBeAssignableTo<{
    id: string;
  }>();
  expect<{ id: string }>().type.toBeAssignableTo<
    InferStaticParams<typeof single>
  >();

  const catchAll = defineAppRoute("/files/[...seg]", {
    params: { seg: p.string() },
  });
  expect(encodeStaticParams(catchAll, { seg: ["a"] })).type.toBeAssignableTo<{
    seg: string[];
  }>();

  const optional = defineAppRoute("/docs/[[...slug]]", {
    params: { slug: p.string() },
  });
  // The optional catch-all key is OMITTABLE (the R3 base-path variant) —
  // unlike InferRouteParams, where D6 normalization makes it required.
  expect<{}>().type.toBeAssignableTo<InferStaticParams<typeof optional>>();
  expect(encodeStaticParams(optional, {})).type.toBeAssignableTo<{
    slug?: string[];
  }>();

  // Structural Next compat: what generateStaticParams / getStaticPaths
  // params accept (mapped types carry implicit index signatures).
  expect(encodeStaticParams(single, { id: 1 })).type.toBeAssignableTo<
    Record<string, string | string[] | undefined>
  >();
});

test("encodeStaticParams: input is the typed encode side, not wire strings", () => {
  const dates = defineAppRoute("/events/[date]", {
    params: { date: p.isoDate() },
  });
  expect(encodeStaticParams).type.toBeCallableWith(dates, {
    date: new Date("2026-07-10"),
  });
  // The isoDate codec's encode input is a Date — its own wire form is not
  // accepted, exactly as href/buildPath behave.
  expect(encodeStaticParams).type.not.toBeCallableWith(dates, {
    date: "2026-07-10",
  });
  expect(encodeStaticParams).type.not.toBeCallableWith(dates, {});
});
