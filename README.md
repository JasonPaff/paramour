# paramour

> _paramour_ — "param" + "amour": a library that loves your params.

[![npm](https://img.shields.io/npm/v/paramour)](https://www.npmjs.com/package/paramour)
[![CI](https://github.com/JasonPaff/paramour/actions/workflows/ci.yml/badge.svg)](https://github.com/JasonPaff/paramour/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/paramour)](./LICENSE)

A fully type-safe routing companion for the Next.js App Router: validated, typed
route params and search params, type-checked path building, and a predictable,
human-readable URL wire format — with your choice of validation library via
[Standard Schema](https://github.com/standard-schema/standard-schema).

**Documentation: [paramour.dev](https://paramour.dev)** — start with
[Getting Started](https://paramour.dev/docs/getting-started), or try the
[wire-format explorer](https://paramour.dev/explorer). The docs site defines
its own routes with paramour and runs `paramour check` in its build — it is
itself an integration test.

```ts
import { defineAppRoute, href, p } from "paramour";

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { q: p.string().optional() },
});

// typed, validated, explicit: "/product/42?q=paramour"
href(productRoute, { params: { id: 42 }, search: { q: "paramour" } });

// a string into p.integer() fails to compile
href(productRoute, { params: { id: "42" } });
```

## Packages

| Package                                        | What it is                                                            | Docs                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| [`paramour`](./packages/core)                  | Core: codecs (`p.*`), route objects, `href`, the wire format          | [reference](https://paramour.dev/docs/reference/core)     |
| [`@paramour-js/next`](./packages/next)         | Next.js integration: `withTypedRoutes`, hooks, and the `paramour` CLI | [reference](https://paramour.dev/docs/reference/next)     |
| [`@paramour-js/nuqs`](./packages/nuqs)         | Derive [nuqs](https://nuqs.dev) parsers from a route's search codecs  | [reference](https://paramour.dev/docs/reference/nuqs)     |
| [`@paramour-js/devtools`](./packages/devtools) | TanStack Devtools panel: watch routes decode live                     | [reference](https://paramour.dev/docs/reference/devtools) |

## Why

Born from lessons learned maintaining and contributing to
[`next-typesafe-url`](https://www.npmjs.com/package/next-typesafe-url), which is
effectively unmaintained. Paramour aims to be a documented, tested,
community-maintained answer to typed routing in Next.js — with a
[migration guide](https://paramour.dev/docs/migrate) written by migrating a
real `next-typesafe-url` app route by route.

## Examples

The [`examples/`](./examples/) directory has an index of the example
projects — from a minimal tour to an exhaustive kitchen sink — all built and
typechecked in CI.

## Contributing

Bugs and feature requests are welcome —
[open an issue](https://github.com/JasonPaff/paramour/issues/new/choose).

## License

MIT © Jason Paff
