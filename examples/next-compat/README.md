# examples/next-compat

Compatibility checks: pins paramour's hand-written assumptions about Next
against a real Next install, on every supported major — at the type level
(`src/`) and through a real `next build` (`build-app/`).

`@paramour-js/next` is hermetic — it declares `next` as a peer only and
typechecks against hand-authored ambients (`declare module
"next/navigation"`, hardcoded phase strings, structural context/props
shapes). Each of those is a claim about a package the shipped code never
sees. This package is where a real Next IS installed, so the claims get
checked twice per CI matrix leg (DESIGN §12: latest two majors, swapping
only this package's `next`):

- `tsc --noEmit` over `src/` — the type pins below.
- `next build build-app` — a minimal two-router app, for the failures the
  type layer can never see. The workspace packages are installed as
  INJECTED deps (`dependenciesMeta.injected` — hard copies inside
  node_modules, not symlinks) so Next's default externals treatment matches
  a real install: the `pages/` route proves the package survives Node ESM
  resolution when loaded as an external at "Collecting page data" (the
  extensionless `next/router` import built green through workspace symlinks
  while failing every real Next 15 install), and the `app/` route proves
  `props: RouteProps` survives Next 15.5's generated `.next/types`
  page-props check. Injected copies are materialized at INSTALL time — after
  changing `packages/*`, rebuild then re-run `pnpm install` to sync them.

## What each file pins

Every file guards against a specific way a Next release could silently break
paramour, and most start by proving the imported Next types didn't resolve
to `any` (which would make the pins pass vacuously):

- `navigation.ts` — the `next/navigation` ambient: real `useParams` /
  `useSearchParams` returns are legal decoder inputs (`ParamsSource` /
  `SearchSource`) and haven't gone async.
- `router.ts` — the `next/router` twin: `useRouter().query` feeds the
  decoders, `isReady` is a plain boolean.
- `contexts.ts` — core's structural `PagesContext`: `getServerSideProps` and
  `getInitialProps` contexts compose with `parseContext`, `getStaticProps`
  is rejected (PR10).
- `props.ts` — core's `RouteProps` accepts what a real App Router page
  receives (Promise-wrapped `params`/`searchParams`) and hasn't decayed into
  accepting anything.
- `phases.ts` — the phase strings hardcoded in `withTypedRoutes` still match
  `next/constants` (a divergence would make the wrapper a silent no-op).
- `config.ts` — `withTypedRoutes`'s return stays assignable to what a
  `next.config.ts` may export.

## Running it

From the repo root:

```sh
pnpm build:packages   # the pins resolve @paramour-js/next through its built dist
pnpm install          # re-sync the injected copies with that dist
pnpm --filter example-next-compat typecheck
pnpm --filter example-next-compat build:gate
```

That checks against the version pinned in this package.json (the canonical
lockfile leg). To reproduce another matrix leg locally, swap this package's
Next first: `pnpm --filter example-next-compat add -D next@15.5.20` (the
`add` is itself an install, so it re-syncs the injected copies too).
