# examples/pages-router

The canonical Pages Router paramour app, typechecked and built in CI. This is
the gate that catches `next/router`-vs-`next/navigation` resolution failures
for real: everything here imports from `@paramour-js/next/pages`.

What it demonstrates:

- **Route definitions outside `pages/`** — `lib/routes.ts` holds every
  `definePagesRoute`. The App Router examples' colocated `route.def.ts`
  pattern is impossible here: under `pages/`, every file with a page
  extension _is_ a page.
- **Server-surface parsing** — `safeParseContext` in `getServerSideProps`
  (`/products/[id]`; a malformed URL becomes `notFound: true` — try
  `/products/not-a-number`), and throwing `parseContext` in
  `getInitialProps` (`/legacy/[id]`, where the context has no `params` and
  the path param is extracted from `query` by segment name).
- **Static generation** — `/guides/[topic]` is SSG. `getStaticPaths` returns
  plain path **strings** built with `buildPath(guideRoute, { topic })` (typed
  at build time — a bad params object fails `next build`, not a request), and
  `fallback: "blocking"` means `getStaticProps` still decodes `ctx.params`
  itself: `safeDecodeParams(route, ctx.params, { percentDecode: false })`, the
  documented static-context path (PR10 — `parseContext` rejects query-less
  contexts by design). Try `/guides/not-a-topic`: the enum decode fails and
  becomes `notFound: true`, a real 404.
- **Three-state client hooks** — `useRouteParams`/`useSearch` return
  `pending | success | error`. `/find` is statically optimized, so a hard
  load actually renders the `pending` arm before `router.isReady` flips; the
  GSSP product page is `isReady` from its first render and never shows it.
- **Typed links** — every `<Link>` is fed by `href(route, { params, search
})`; `href()` is router-agnostic.
- **Imperative navigation** — `href()` output feeds `next/router`'s
  `push`/`replace` directly (`Href` is a string subtype). The `/find` form
  replaces the URL on submit and the three-state hooks re-decode it; the
  product page's prev/next buttons `router.push` to a sibling `[id]`, running
  `getServerSideProps` again.
- **Codegen** — `next.config.ts` wraps the config with
  `withTypedRoutes(config, { strict: true })`. The committed
  `paramour-env.d.ts` registers a `pagesRoutes` union, narrowing
  `definePagesRoute` path literals to filesystem-verified routes while
  `defineAppRoute` keeps its permissive world-A fallback.

## Running it

From the repo root:

```sh
pnpm install
pnpm build          # packages first (tsc), then this app (next build)
pnpm --filter example-pages-router dev
```

## The drift contract

Add or remove a page file and `next build` fails, naming the paths that
appeared or disappeared (and the router they moved in), until the artifact is
regenerated and committed:

```sh
cd examples/pages-router
pnpm exec paramour generate   # or let `next dev`'s watcher do it
```

`pnpm exec paramour generate --check` is the CI-friendly no-write variant
(exit 1 on drift).
