# examples/kitchen-sink

Exercises **every** paramour surface in one Next.js App Router app —
typechecked and built in CI. Where `examples/basic` is the minimal tour, this
is the exhaustive one. It also depends on [Zod](https://zod.dev) to show
Standard Schema integration (Zod v4 implements Standard Schema natively).

## What each route demonstrates

| Route               | Surface                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | static route; `href()` to every route; branded `Href` into `<Link>`                                                                                                                                                                                                                                        |
| `/products/[id]`    | single `[id]` (Zod-refined `p.integer`); search covering `p.string`(+schema)/`p.number`/`p.boolean`/`p.enum`/`p.integer`/`p.stringArray` with `.optional()`, value `.default()` (+ D8 elision), and `.default().catch()`; server `parse` + `parseParams`; safe client hooks (`useRouteParams`/`useSearch`) |
| `/docs/[[...slug]]` | optional catch-all; `safeParse` → `notFound()`                                                                                                                                                                                                                                                             |
| `/files/[...path]`  | required catch-all; `safeParseParams` (renders `.issues` on failure)                                                                                                                                                                                                                                       |
| `/events/[date]`    | `p.isoDate` param; `p.timestamp`/`p.json`(+schema)/`p.custom` search; **factory** `.default(() => …)` and `.catch(() => …)`; `parseParams` + `safeParseSearch`; throwing client hooks (`useRouteParamsOrThrow`/`useSearchOrThrow`)                                                                         |
| `/find`             | `rawSearch(schema)` whole-object escape hatch; `parseSearch`                                                                                                                                                                                                                                               |
| `/serialize`        | interactive `buildPath`/`encodeParams`/`decodeParams`/`encodeSearch`/`decodeSearch`/`buildSearchString`/`searchToString`, and the error hierarchy (`ParamourError`, `ParseError` vs `SerializeError`, `ParamsDecodeError`/`SearchDecodeError` + `.issues`)                                                 |

Shared pieces live in `lib/`: `schemas.ts` (the Zod validators) and `codecs.ts`
(a `p.custom` CSV codec and a standalone `SearchConfig` for the playground).

## Running it

From the repo root:

```sh
pnpm install
pnpm build          # packages first (tsc), then this app (next build)
pnpm --filter example-kitchen-sink dev
```

Then try the decode-failure links on the home page (`/products/not-a-number`,
`/products/-5`, `/docs?page=not-a-number`) and edit the inputs on `/serialize`.

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
