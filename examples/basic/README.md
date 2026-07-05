# examples/basic

The canonical minimal paramour app, typechecked and built in CI.

What it demonstrates:

- **Colocated route definitions** — each route folder owns a `route.def.ts`
  built with `defineRoute` and `p.*` codecs (integer params, defaulted and
  optional search params, an optional catch-all).
- **Server-surface parsing** — `route.parse(props)` in pages (throws to the
  colocated `error.tsx`; try `/product/not-a-number`), `parseParams` in
  `generateMetadata`, and `safeParse` + `notFound()` on the docs page (try
  `/docs?page=not-a-number`).
- **Typed links** — every `<Link>` is fed by `href(route, { params, search,
hash })`.
- **Codegen** — `next.config.ts` wraps the config with
  `withTypedRoutes(config, { strict: true })`. The generated
  `paramour-env.d.ts` is committed: it narrows `defineRoute` path literals to
  filesystem-verified routes, and `strict: true` makes a production build
  fail on drift.

## Running it

From the repo root:

```sh
pnpm install
pnpm build          # packages first (tsc), then this app (next build)
pnpm --filter example-basic dev
```

## The drift contract

Add or remove a page folder and `next build` fails, naming the paths that
appeared or disappeared, until the artifact is regenerated and committed:

```sh
cd examples/basic
pnpm exec paramour generate   # or let `next dev`'s watcher do it
```

`pnpm exec paramour generate --check` is the CI-friendly no-write variant
(exit 1 on drift).
