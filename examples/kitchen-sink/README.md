# examples/kitchen-sink

Exercises **every** paramour surface in one hybrid Next.js app — an App
Router tree plus one Pages Router route beside it — typechecked and built in
CI. Where `examples/basic` is the minimal tour, this is the exhaustive one.
It also depends on [Zod](https://zod.dev) to show Standard Schema integration
(Zod v4 implements Standard Schema natively).

## What each route demonstrates

| Route               | Surface                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | static route; `href()` to every route; branded `Href` into `<Link>`                                                                                                                                                                                                                                                           |
| `/products`         | URL-as-state filter form: safe `useSearch` + `router.replace(href(route, { search }), { scroll: false })` round-trip (text input debounced); `router.push(href(...))` to the detail route; `InferSearchInput` form state; D8 elision and S6 (`[]` ≡ absent) live in the URL bar; Suspense boundary instead of `force-dynamic` |
| `/products/[id]`    | single `[id]` (Zod-refined `p.integer`); search covering `p.string`(+schema)/`p.number`/`p.boolean`/`p.enum`/`p.integer`/`p.stringArray` with `.optional()`, value `.default()` (+ D8 elision), and `.default().catch()`; server `parse` + `parseParams`; safe client hooks (`useRouteParams`/`useSearch`)                    |
| `/docs/[[...slug]]` | optional catch-all; `safeParse` → `notFound()`                                                                                                                                                                                                                                                                                |
| `/files/[...path]`  | required catch-all; `safeParseParams` (renders `.issues` on failure)                                                                                                                                                                                                                                                          |
| `/events/[date]`    | `p.isoDate` param; `p.timestamp`/`p.json`(+schema)/`p.custom` search; **factory** `.default(() => …)` and `.catch(() => …)`; `parseParams` + `safeParseSearch`; throwing client hooks (`useRouteParamsOrThrow`/`useSearchOrThrow`)                                                                                            |
| `/find`             | `rawSearch(schema)` whole-object escape hatch; `parseSearch`                                                                                                                                                                                                                                                                  |
| `/search`           | legacy redirect endpoint that never renders: server-side `safeParseSearch`, `redirect(href(...))` translating old keys (`keyword`→`q`, `tag`→`tags`), `permanentRedirect(href(...))` for moved deep links (`?product=4` → `/products/4`; browsers cache 308s hard); decode failure falls back to the bare list                |
| `/serialize`        | interactive `buildPath`/`encodeParams`/`decodeParams`/`encodeSearch`/`decodeSearch`/`buildSearchString`/`searchToString`, and the error hierarchy (`ParamourError`, `ParseError` vs `SerializeError`, `ParamsDecodeError`/`SearchDecodeError` + `.issues`)                                                                    |
| `/legacy`           | the hybrid route (design-06 PR1): a `pages/` route beside `app/`; `definePagesRoute`; three-state `useSearch` from `@paramour-js/next/pages`; one artifact registering `appRoutes` **and** `pagesRoutes`; `href()` across the router boundary                                                                                 |
| `/about`            | route group: the page lives at `app/(marketing)/about/` under a group layout (shared banner, private `_components/` folder), but the typed route — and the artifact entry — is plain `/about`                                                                                                                                 |
| `/dashboard`        | parallel routes: the server page and the client `@stats` slot render side by side and decode the **same** typed search (`range` enum with D8-eliding default) from one URL; the `@stats` subtree never reaches the artifact                                                                                                   |
| `/gallery`          | intercepting route, modal pattern: soft-nav from the grid renders `@modal/(.)[photoId]` as an overlay (`router.back()` dismisses); hard load renders the full `[photoId]` page — same URL, one route def typing both surfaces                                                                                                 |
| `/feed`             | slot-less interception (Next docs' `feed/(..)photo` shape): the same `/gallery/[photoId]` links render `(..)gallery/[photoId]` inline in the children position on soft nav; the third surface decoding the one `galleryPhotoRoute` def                                                                                        |
| `/_internal`        | the `%5F` escape: a `%5Finternal/` folder serves a URL segment with a literal leading `_` (a plain `_internal/` folder would be private and route nothing); the scanner decodes the escape the same way                                                                                                                       |

Shared pieces live in `lib/`: `schemas.ts` (the Zod validators) and `codecs.ts`
(a `p.custom` CSV codec and a standalone `SearchConfig` for the playground).

## Exotic file conventions as a scanner gate

The last five routes above exist for a second reason: they keep every exotic
App Router file convention alive in a tree that CI both `next build`s and
drift-checks (`strict: true`), so a scanner regression against real Next
behavior fails the build, not just a unit test. What the scanner must do with
each:

- **emit, group-stripped** — `(marketing)/about` → `/about`
- **emit, escape-decoded** — `%5Finternal` → `/_internal`
- **skip entirely** — `@stats`, `@modal` (parallel slots), `(.)[photoId]`,
  `(..)gallery` (interception markers), `_components` (private folder)

The interception conventions are pure render plumbing — they never mint a new
URL. That's the demo on the read side too: the full page, the `@modal`
overlay, and the `/feed` inline preview all decode params through the single
`galleryPhotoRoute` def, because they all serve `/gallery/[photoId]`.

Try it: from `/gallery` click a card (overlay; the URL bar changes), reload
(full page), then from `/feed` click the same photo (inline preview).

## Running it

From the repo root:

```sh
pnpm install
pnpm build          # packages first (tsc), then this app (next build)
pnpm --filter example-kitchen-sink dev
```

Then try the decode-failure links on the home page (`/products/not-a-number`,
`/products/-5`, `/docs?page=not-a-number`, `/products?inStock=maybe`), edit
the filters on `/products` while watching the URL bar, follow the legacy
redirects (`/search?keyword=cable&tag=usb-c`, `/search?product=4` — a 308,
so test it in a private window), and edit the inputs on `/serialize`.

## Codegen and the drift contract

`next.config.ts` wraps the config with `withTypedRoutes(config, { strict: true })`,
and `paramour.config.ts` configures the standalone CLI. The generated
`paramour-env.d.ts` is committed: it narrows `defineAppRoute` path literals to
filesystem-verified routes, and `strict: true` makes a production build fail on
drift. Add or remove a page folder and regenerate:

```sh
pnpm --filter example-kitchen-sink paramour           # writes paramour-env.d.ts
pnpm --filter example-kitchen-sink paramour -- --check # CI no-write variant (exit 1 on drift)
```
