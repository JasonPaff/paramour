# Migration: converting raw params/searchParams to paramour

## THE RULE

Migrate INCREMENTALLY: one route per pass. For each pass — define the route object, convert that route's files, run `paramour check` plus the project type check, commit, then move to the next route. NEVER rewrite all routes at once. Paramour routes and raw `params`/`searchParams` access coexist without conflict, so a partially migrated app is a normal, stable state. If asked to "migrate the app", plan a route-by-route sequence and execute it as separate verified passes.

Prerequisite: paramour is installed and `withTypedRoutes` is wired (otherwise do `references/setup.md` first — `npx paramour init` is safe to run on an existing project).

## Worked example: one App Router route

### Before

```tsx
// app/products/[id]/page.tsx
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Number(sp.page ?? "1");
  const sort = sp.sort === "desc" ? "desc" : "asc";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  // ...
}
```

### After

1. Define the route object, colocated with the page:

```ts
// app/products/[id]/route.def.ts
import { defineAppRoute, p } from "paramour";

export const productRoute = defineAppRoute("/products/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
    sort: p.enum(["asc", "desc"]).default("asc"),
  },
});
```

2. Convert the page (and `generateMetadata`, which takes the same props):

```tsx
// app/products/[id]/page.tsx
import type { RouteProps } from "paramour";
import { productRoute } from "./route.def";

export default async function ProductPage(props: RouteProps) {
  const { params, search } = await productRoute.parse(props);
  // params.id: number — search.page: number — search.sort: "asc" | "desc"
  // search.q: string | undefined
  // ...
}
```

3. Verify: `paramour check` (the path already existed, so usually no artifact change), then `tsc --noEmit`. Commit.

## Mapping decisions

### Dynamic segments → `params:` codecs

- `[id]` numeric in practice → `p.integer()`; otherwise keep `p.string()` (behavior-preserving — when unsure, `p.string()` first, tighten later).
- `[...slug]` / `[[...slug]]` → the codec describes ONE segment element (usually `p.string()`); the array comes from the path shape. Decoded type is `Out[]`; an absent optional catch-all decodes to `[]`.
- Presence modifiers are illegal in `params:` — optionality lives in the path grammar (`[[...slug]]`), not the codec.

### searchParams reads → `search:` codecs

- `sp.x ?? "default"` / `Number(sp.x ?? "1")` → codec with `.default(value)`. The decoded field is non-optional and the default value elides from built URLs.
- "May be absent, no fallback" (`typeof sp.x === "string" ? sp.x : undefined`) → `.optional()`. Decoded as `T | undefined`.
- Silent-coercion tolerance (old code shrugged off garbage, e.g. `Number(...)` producing `NaN` handled downstream) → add `.catch(fallback)` so a malformed PRESENT value falls back instead of failing the decode. `.catch()` never covers absence — combine with `.default()`/`.optional()` for that.
- Multi-value keys (`sp.tags` handled as `string | string[]`) → `p.array()` for repeated keys (`?tags=a&tags=b`) or `p.csv()` for one comma-joined key (`?tags=a,b`). Match whichever wire form the app already emits.
- Enumerated strings → `p.enum(["a", "b"])`; numbers → `p.number()`; booleans (`sp.flag === "true"`) → `p.boolean()`; dates → `p.isoDate()` (YYYY-MM-DD) or `p.timestamp()` (ISO UTC).

### Behavior change to decide explicitly

Raw code silently tolerated malformed URLs; `route.parse` THROWS `ParamsDecodeError`/`SearchDecodeError` on them. Pick one per route:

- `parse` + a colocated `error.tsx` boundary (malformed URL renders the boundary), or
- `safeParse` and branch on the result: `if (result.status === "error") notFound();` (or render a fallback), or
- keep `parse` but add `.catch()` on the keys that used to be silently coerced.

### Client components in the route

Replace `useParams()` / `useSearchParams()` reads with the typed hooks:

```tsx
"use client";
import { useRouteParams, useSearch } from "@paramour-js/next/app";
import { productRoute } from "./route.def";

export function Panel() {
  const params = useRouteParams(productRoute); // SafeResult
  const search = useSearch(productRoute);
  if (params.status === "error" || search.status === "error") return null;
  return <span>{search.data.q ?? ""}</span>;
}
```

`useRouteParamsOrThrow`/`useSearchOrThrow` throw to the nearest error boundary instead of returning the error arm. Pages Router components use `@paramour-js/next/pages` (`useRouteParams`/`useSearch`, which add a `pending` status arm; server side, `route.parseContext(ctx)` in `getServerSideProps`).

### Links into the migrated route

Replace hand-built strings with `href` wherever the route is linked:

```tsx
// before
<Link href={`/products/${id}?page=2`}>
// after
<Link href={href(productRoute, { params: { id }, search: { page: 2 } })}>
```

`href(...)` returns a string subtype — `next/link`, `router.push`, and `redirect` accept it unchanged. Convert the links you find; ones you miss keep working (they are just untyped strings) and can be converted in later passes.

### Static generation

`generateStaticParams` → build entries with `encodeStaticParams(route, { id: 42 })` from `paramour`, which returns the per-param wire-string record Next expects.

## What NOT to touch in a pass

- Other routes' raw `params`/`searchParams` access — leave it alone until that route's own pass.
- Shared layouts/components serving unmigrated routes.
- Unrelated search keys the page never read — do not "complete" the search config speculatively; declare only what the route actually uses (undeclared keys are ignored by decode and never emitted by encode).
- Wire formats: do not change a param's URL spelling (e.g. csv ↔ repeated keys) while migrating; preserve existing URLs, change formats in a separate deliberate commit.

## Per-route checklist

1. Read every file of the route (page, layout if it reads params, generateMetadata, client components, links into it) and inventory each `params`/`searchParams` key and its fallback semantics.
2. Create `route.def.ts` with `defineAppRoute` (or `definePagesRoute`): `params:` codec per dynamic segment, `search:` codec per read key with `.default()`/`.optional()`/`.catch()` matching the old semantics.
3. Convert server access: props typed `RouteProps`; `route.parse(props)` / `parseParams` / `parseSearch` (or the `safeParse*` forms). Decide the malformed-URL story (error boundary vs safeParse vs `.catch()`).
4. Convert the route's client components to `@paramour-js/next/app` (or `/pages`) hooks.
5. Convert links into the route to `href(route, ...)`.
6. Run `paramour check` (regenerate + commit the artifact if routes were added/renamed), then the type check and tests.
7. Commit. Next route.
