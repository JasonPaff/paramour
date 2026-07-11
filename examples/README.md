# Examples

Five example projects, each with a different job. They are demos second and
CI gates first: every one is typechecked in CI, the three runnable apps are
`next build`-ed with `strict: true` drift checking, and the negative suite
must _fail_ `tsc` with exactly its annotated diagnostics. If a change breaks
a documented behavior, an example breaks the build.

## Which one to open

In reading order:

- **[basic](./basic/)** — the minimal tour. Colocated route defs, server
  `parse`/`safeParse`, typed `<Link>`s, and codegen with the drift contract,
  in the smallest App Router app that shows them. Start here.
- **[kitchen-sink](./kitchen-sink/)** — the exhaustive one. Every codec,
  every parse variant, every hook; the URL-as-state filter page; imperative
  and server-side navigation; a route handler, server action, and proxy
  (middleware); `generateStaticParams`; a hybrid `pages/` route beside
  `app/`; and every exotic App Router file convention (groups, parallel
  routes, interception, the `%5F` escape) kept alive as a scanner regression
  gate. Zod as the Standard Schema validator.
- **[pages-router](./pages-router/)** — the Pages Router gate. Everything
  imports from `@paramour-js/next/pages`: `getServerSideProps` /
  `getInitialProps` / `getStaticProps`+`getStaticPaths` parsing, three-state
  client hooks, and route defs outside `pages/`. Valibot as the validator,
  so each app demonstrates a different Standard Schema library.
- **[next-compat](./next-compat/)** — no app at all: type-level pins of
  paramour's hand-written assumptions about Next (ambient module
  declarations, phase strings, page-props shapes) against a real Next
  install. CI runs its `tsc --noEmit` once per supported Next major.
- **[type-errors](./type-errors/)** — the negative suite. A never-built
  hybrid app that must fail `tsc --noEmit` with exactly the diagnostics
  annotated in `cases/` — illegal codec chains, `href()` violations,
  registry rejections — checked as a _consumer_ through the built dist types
  and a generated `paramour-env.d.ts`.

## Running the apps

basic, kitchen-sink, and pages-router are real Next apps. From the repo
root:

```sh
pnpm install
pnpm build          # packages first (tsc), then the example apps (next build)
pnpm --filter example-basic dev          # or example-kitchen-sink / example-pages-router
```

next-compat and type-errors never run — they are `tsc`-only. See
[type-errors](./type-errors/) for its `pnpm check:type-errors` harness.

## The drift contract

Each runnable app commits its generated `paramour-env.d.ts` and wraps
`next.config.ts` with `withTypedRoutes(config, { strict: true })`: add or
remove a page and `next build` fails, naming the paths that changed, until
the artifact is regenerated (`pnpm exec paramour generate`, or the `next dev`
watcher) and committed. `paramour generate --check` is the no-write CI
variant. Each example's own README covers what it demonstrates route by
route.
