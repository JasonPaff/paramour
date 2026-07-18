# @paramour-js/nuqs

Derive [nuqs](https://nuqs.dev) parsers from [paramour](https://github.com/JasonPaff/paramour) search codecs — presence, defaults, catch recovery, and equality read off the route's codecs once, mechanically.

paramour owns the route contract: server-side `parseSearch`/`safeParseSearch` and typed `href()` links into the page. nuqs owns high-frequency in-page client URL state. Integrating them by hand costs a `createParser` bridge, every default declared twice, and hand-written `eq` functions for Dates and arrays. This package deletes all three layers: the adapter reads what the modified codec already carries.

```bash
pnpm add @paramour-js/nuqs nuqs
```

## Quick start

```ts
// route.def.ts — an ordinary route definition, nothing restated for nuqs
export const productsRoute = defineAppRoute("/products", {
  search: {
    labels: p.csv().default([]),
    page: p.integer().default(1),
    q: p.string().optional(),
    tags: p.array(),
  },
});

// search-params.ts — the entire bridge
import { nuqsParsers } from "@paramour-js/nuqs";
export const productsParsers = nuqsParsers(productsRoute);
```

```tsx
// A client component
"use client";
import { useQueryStates } from "nuqs";
import { productsParsers } from "./search-params";

const [search, setSearch] = useQueryStates(productsParsers);
// search: { labels: string[]; page: number; q: string | null; tags: string[] }
```

`nuqsParsers` accepts either a route object or a bare `SearchConfig` codec map. `nuqsParser` derives a single parser from one codec. The result is ordinary nuqs currency — it composes with `useQueryState(s)`, `withOptions`, `createSerializer`, `createLoader`, and `createSearchParamsCache` untouched. Remember nuqs v2's `NuqsAdapter` provider in your layout.

The adapter imports from `nuqs/server`, so the derived parsers are usable in server code without pulling in the client hooks.

## What each codec derives

| Codec shape                 | Derived parser                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| required or optional scalar | plain parser — absent/unparseable reads `null`                     |
| `.default(value)`           | `withDefault(value)` — non-nullable read, clearOnDefault stays on  |
| `.default(() => value)`     | plain (nullable) parser — see below                                |
| `.catch(value \| fn)`       | parse failures recover to the catch value before nuqs's `null`     |
| `p.array()`                 | multi parser (repeated keys, `?tags=a&tags=b`) — absent reads `[]` |

**Equality is wire-form.** The derived `eq` compares values by serializing both through the codec — the same judgment paramour's encode uses to elide default values. So nuqs's clearOnDefault and paramour's URL elision agree by construction, for every codec kind including `p.custom`, with no hand-written comparators: both writers produce the identical canonical URL.

**Errors stay in their lane.** Client-side parse failures are silent-null (nuqs's convention — recoverable UI state), honoring `.catch()` first. The loud, branded failure surface is the server-side route decode, which sees the same URL and reports real per-key issues. Paramour contract violations (anything that isn't a `ParseError`, including a throwing catch factory) propagate loudly rather than reading as `null`.

## The documented asymmetries

- **Factory defaults read `null` client-side.** `.default(() => …)` is time-varying by declaration: paramour re-invokes it per decode and never elides it, while nuqs's `withDefault` would freeze one value and clear-on-default against it — both halves lying about factory semantics. So factory-defaulted keys derive a _nullable_ parser; apply the factory at the read site when you want the paramour-decoded shape.
- **Value defaults are snapshotted at derivation.** The value handed to `withDefault` is read once when `nuqsParsers` runs. Mutating a reference-typed default afterwards is unsupported: paramour's elision re-serializes the live default per encode and would follow the mutation, but the frozen nuqs copy will not.
- **Duplicated scalar keys read differently.** `?page=1&page=2` is a grammar violation to the server decode (an error, or the `.catch` value), but nuqs hands parsers only the _first_ value, which parses cleanly. The adapter never sees the duplicate, so the divergence cannot be closed at this layer. Neither side ever _writes_ a duplicated scalar key.
- **Absent optionals are `undefined` server-side, `null` client-side** — each router's native spelling of absence.

## Shapes with no nuqs twin

These fail to compile at the `nuqsParser`/`nuqsParsers` call (and throw a `ParamourError` at runtime for plain-JS callers):

- **Codecs whose output includes `null`** (e.g. `p.custom<string | null>`): nuqs reserves `null` for absent/unparseable, so a legitimately-null value would be indistinguishable from a parse failure. (Type-level only — a null slipped past the types degrades to nuqs's native null semantics.)
- **`rawSearch` routes** — one whole-object schema, no per-key codecs to derive from.
- **Routes with no search config**, and empty codec maps.

## Versioning

`paramour` is a regular dependency pinned to the same-minor via the workspace — the adapter reads codec runtime internals, so the pair moves together. `nuqs` is a peer dependency at `^2.9.0`: the adapter leans on v2 semantics (clearOnDefault default-on, `createParser` equality support) and 2.9's `createMultiParser` for repeated-key arrays.
