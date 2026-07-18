import { definePagesRoute, p, type SearchConfig } from "paramour";

import { guideTopics } from "./guides";
import { positiveInt, searchQuery } from "./schemas";

// One module for every route definition. The colocated route.def.ts pattern
// from the App Router examples is impossible here BY DESIGN: under pages/,
// every file with a page extension IS a page (design-06 spike 1 — only
// top-level _app/_document/_error are special), so a pages/products/
// route.def.ts would become the route /products/route.def. Definitions live
// outside the scanned dir instead.

// Exported on its own so the find form can name its input type with
// InferSearchInput<typeof findSearch>.
export const findSearch = {
  // Numeric on purpose: /find?max=not-a-number is the client-side decode
  // failure demo (the hooks' error arm; strings alone can never fail).
  max: p.integer().optional(),
  // The Valibot refinement gives strings a failure mode of their own:
  // /find?q=a fails min-length-2 and lands in the same error arm.
  q: p.string(searchQuery).optional(),
  tag: p.array(),
} satisfies SearchConfig;

export const findRoute = definePagesRoute("/find", { search: findSearch });

// Statically generated (getStaticPaths + fallback: "blocking"): the param is
// an enum, so any URL outside guideTopics fails decode in getStaticProps and
// becomes a 404 — a runtime gate, not just a build-time enumeration.
export const guideRoute = definePagesRoute("/guides/[topic]", {
  params: { topic: p.enum(guideTopics) },
});

export const homeRoute = definePagesRoute("/", {});

// No `search` config: this page is read exclusively through getInitialProps
// + parseContext, which extracts [id] from ctx.query by segment name
// (NextPageContext has no `params`, even on dynamic routes — PR10).
export const legacyRoute = definePagesRoute("/legacy/[id]", {
  params: { id: p.integer() },
});

// positiveInt is Valibot, mirroring kitchen-sink's identical Zod refinement:
// /products/0 fails minValue(1) in safeParseContext and becomes a real 404.
export const productRoute = definePagesRoute("/products/[id]", {
  params: { id: p.integer(positiveInt) },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});
