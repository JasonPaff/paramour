# examples/next-compat

Type-level compatibility checks: pins paramour's hand-written assumptions
about Next against a real Next install, on every supported major.

There is no app here and nothing ever runs. `@paramour-js/next` is hermetic —
it declares `next` as a peer only and typechecks against hand-authored
ambients (`declare module "next/navigation"`, hardcoded phase strings,
structural context/props shapes). Each of those is a claim about a package
the shipped code never sees. This package is where a real Next IS installed,
so the claims get checked: `tsc --noEmit` is the only entry point, and CI
runs it once per supported Next major (DESIGN §12: latest two majors),
swapping only this package's `next` per matrix leg.

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
pnpm --filter example-next-compat typecheck
```

That checks against the version pinned in this package.json (the canonical
lockfile leg). To reproduce another matrix leg locally, swap this package's
Next first: `pnpm --filter example-next-compat add -D next@15.5.20`.
