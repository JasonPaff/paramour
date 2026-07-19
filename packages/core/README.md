# paramour

Type-safe routing companion for the Next.js App Router: validated, typed
route and search params, type-checked path building, and a predictable,
human-readable URL wire format. Validation is bring-your-own via
[Standard Schema](https://github.com/standard-schema/standard-schema) —
paramour owns serialization (the part validators can't do), your validator
owns the rules.

```sh
pnpm add paramour @paramour-js/next
```

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

Routes are plain imported objects — no central registry, nothing to
tree-shake around. Codecs are bidirectional wire converters with a
type-state modifier API (`.optional()`, `.default()`, `.catch()`) where
illegal chains fail to compile, and every codec serializes by a
[published, numbered spec](https://paramour.dev/docs/reference/wire-format).

## Docs

- [Getting started](https://paramour.dev/docs/getting-started)
- [Core API reference](https://paramour.dev/docs/reference/core)
- [Wire-format spec & explorer](https://paramour.dev/docs/reference/wire-format)
- [Migrating from next-typesafe-url](https://paramour.dev/docs/migrate)

## License

MIT © Jason Paff
