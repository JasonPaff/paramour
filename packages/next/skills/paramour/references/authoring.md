# Authoring: codecs, routes, links, hooks

## `p.*` codec builders (import `{ p }` from `"paramour"`)

Wire grammars are strict and anchored — no `Number()` coercion, no whitespace, no hex, no `1e3` for integers. Every parse failure is a `ParseError` (recoverable per-key with `.catch()`); every serialize failure is a `SerializeError` at link-build time.

| Builder              | Decoded type     | Wire behavior                                                                                                                                                                                                                                  | Options                                                                                             |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `p.string(schema?)`  | `string`         | Verbatim text. Empty string is a real value (`key=`), not absence.                                                                                                                                                                             | Optional Standard Schema `<string, string>` refinement (runs on parse AND serialize)                |
| `p.integer(schema?)` | `number`         | `/^-?\d+$/`, safe-integer range.                                                                                                                                                                                                               | Optional Standard Schema `<number, number>`                                                         |
| `p.number(schema?)`  | `number`         | Decimal/scientific notation, finite only.                                                                                                                                                                                                      | Optional Standard Schema `<number, number>`                                                         |
| `p.boolean()`        | `boolean`        | Exactly `"true"` / `"false"`.                                                                                                                                                                                                                  | —                                                                                                   |
| `p.enum(members)`    | union of members | Exact member match. `p.enum(["asc", "desc"])` decodes to `"asc" \| "desc"`.                                                                                                                                                                    | Non-empty readonly string tuple                                                                     |
| `p.isoDate()`        | `Date`           | `YYYY-MM-DD`, real calendar dates only (rejects `2026-02-30`); serializes UTC date part.                                                                                                                                                       | —                                                                                                   |
| `p.timestamp()`      | `Date`           | ISO 8601 UTC only (`...T..:..:..[.mmm]Z`, offsets rejected); serializes `Date#toISOString()`.                                                                                                                                                  | —                                                                                                   |
| `p.json(schema)`     | schema output    | `JSON.parse` then schema; serialize re-validates then `JSON.stringify`.                                                                                                                                                                        | Standard Schema (required)                                                                          |
| `p.index(schema?)`   | `number`         | 1-based on the wire, 0-based in memory: `?page=1` ↔ `0`. Wire `< 1` is a parse failure; negative in-memory index is a `SerializeError`.                                                                                                        | Optional Standard Schema `<number, number>` (validates the 0-based value)                           |
| `p.csv(element?)`    | `E[]`            | ONE wire value, comma-joined (`?tags=a,b`). Empty wire string is `[]`; `a,,b` / trailing comma are parse failures; serializing an element that is empty or contains a comma is a `SerializeError`. Arity "single" — full modifier set applies. | Optional element codec (default `p.string()`); element must be an unmodified scalar, no nested csv  |
| `p.array(element?)`  | `E[]`            | Repeated keys (`?tags=a&tags=b`). Absent ≡ `[]` — so NO `.optional()`/`.default()`; `.catch()` recovers the whole list.                                                                                                                        | Optional element codec (default `p.string()`); element must be an unmodified scalar, not arity-many |
| `p.custom({ ... })`  | `Out`            | Your bidirectional transform. Thrown foreign errors are rebranded `ParseError`/`SerializeError`.                                                                                                                                               | `{ parse: (raw: string) => Out; serialize: (value: Out) => string; label?: string }`                |

## Modifier chains

| Modifier                        | Effect on decode                                                     | Effect on href input | Effect on URL                                                                                      |
| ------------------------------- | -------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| (none — required)               | Absent key is a decode issue                                         | Key required         | Always emitted when building                                                                       |
| `.optional()`                   | Absent → `undefined`; field type `T \| undefined`                    | Key omittable        | Omitted key emits nothing                                                                          |
| `.default(value)`               | Absent → default; field type stays `T`                               | Key omittable        | Value equal to the default ELIDES (compared by serialized wire form) — one canonical URL per state |
| `.default(() => value)`         | Absent → factory result; field type stays `T`                        | Key omittable        | NEVER elides (a time-varying factory would swallow explicit values)                                |
| `.catch(v)` / `.catch(() => v)` | A PRESENT value that fails parsing → fallback. Never covers absence. | No change            | No change                                                                                          |

Legality (compile-time type-state — illegal calls type as `never`; runtime throws for JS):

- Legal: `p.integer()`, `.optional()`, `.default(1)`, `.catch(0)`, `.optional().catch(0)`, `.catch(0).optional()`, `.default(1).catch(0)`, `.catch(0).default(1)`, `p.csv().default([])`, `p.array().catch([])`.
- Illegal: `.optional().default(...)`, `.default(...).optional()`, `.optional().optional()`, `.default(...).default(...)`, `.catch(...).catch(...)`, `p.array().optional()`, `p.array().default(...)`, any modifier on a csv/array ELEMENT (`p.csv(p.string().optional())`), `p.csv(p.csv())`, `p.array(p.array())`, and `.default(value)` where the value's type includes a function member (use the factory form).
- `params:` codecs additionally forbid `.optional()`/`.default()` (path optionality comes from `[[...slug]]`); `.catch()` is fine.

Value vs factory `.default()`: value defaults are serialized eagerly at definition time (an invalid default fails immediately) and participate in URL elision; factory defaults are invoked per decode (fresh reference per call — use for mutable objects) and never elide. Array value defaults are handed out as fresh shallow copies per decode.

## Defining routes

```ts
import { defineAppRoute, definePagesRoute, p } from "paramour";

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { page: p.index().default(0), tags: p.csv() },
});

export const docsRoute = defineAppRoute("/docs/[[...slug]]", {
  params: { slug: p.string() }, // codec describes ONE segment element
});

export const aboutRoute = defineAppRoute("/about", {}); // static: params rejected

export const blogRoute = definePagesRoute("/blog/[slug]", {
  params: { slug: p.string() },
  search: { preview: p.boolean().optional() },
});
```

Rules:

- Path literal is checked against the generated registry (`paramour-env.d.ts`); pre-generation any literal compiles. Exactly one codec per dynamic segment name; extra or misspelled `params:` keys fail to compile.
- `[...slug]` / `[[...slug]]` decode to `Out[]` (absent optional catch-all → `[]`); the codec is per-element, `.catch()` recovery is element-wise.
- Pages routes forbid a search key shadowing a path param name (Next merges `query`, path params win).
- Whole-object escape hatch: `search: rawSearch(zodSchema)` hands the entire search object to one Standard Schema — schema sees every key on decode; encode is a raw pass-through of wire strings (no round-trip, no elision). Prefer codec maps.

## Server-side reads

App Router (async, props-based): `route.parse(props)`, `route.parseParams(props)`, `route.parseSearch(props)` — throw `ParamsDecodeError`/`SearchDecodeError` on malformed URLs (params decode first) — plus `safeParse`/`safeParseParams`/`safeParseSearch` returning `SafeResult` (`status: "success" | "error"`). Annotate page props as `RouteProps` (or `ParamsProps`/`SearchProps` for layouts/halves) from `paramour`; `generateMetadata` takes the same props.

Pages Router (sync, context-based): `route.parseContext(ctx)` / `route.safeParseContext(ctx)` with a `getServerSideProps` or `getInitialProps` context (`{ params?, query }`). NOT `getStaticProps` (no query string) — decode `ctx.params` with `safeDecodeParams(route, ctx.params ?? {})` there.

Standalone sync decoders (middleware, route handlers, anywhere holding a source): `decodeParams`/`decodeSearch` (throwing) and `safeDecodeParams`/`safeDecodeSearch` (SafeResult), all from `paramour`.

## Typed links

```ts
import { href } from "paramour";

href(productRoute, { params: { id: 42 }, search: { tags: ["a", "b"] } });
// "/product/42?tags=a,b"
href(aboutRoute); // "/about" — options omittable when nothing is required
href(productRoute, { params: { id: 1 }, hash: "reviews" }); // "#reviews" appended verbatim
href("/about", { hash: "team" }); // string form: registered STATIC paths only
```

`href` returns `Href` — a string subtype accepted by `next/link`, `router.push`, `redirect` unchanged. Required params/search make the options argument required; defaulted/optional/array keys are omittable. Serialization failures (bad value, empty segment, required catch-all given `[]`) throw `SerializeError` at link-build time. Lower-level pieces: `buildPath(route, params)`, `searchToString(config, input)`, `encodeStaticParams(route, params)` for `generateStaticParams`/`getStaticPaths`.

## Client hooks

App Router — `import { useRouteParams, useRouteParamsOrThrow, useSearch, useSearchOrThrow } from "@paramour-js/next/app"` (client components only; app-branded routes only, compile-enforced):

- `useRouteParams(route)` / `useSearch(route)` → `SafeResult`: branch on `result.status === "error"` before touching `result.data`. No loading state; SSR-consistent.
- `useRouteParamsOrThrow(route)` / `useSearchOrThrow(route)` → decoded value, throwing the decode error to the nearest error boundary.
- All four accept optional `{ select: (value) => U, equality?: "shallow" }` — a projection with result-equality stabilization so unrelated URL churn (e.g. `utm_*`) does not produce new references.

Pages Router — `import { useRouteParams, useSearch } from "@paramour-js/next/pages"` (pages-branded routes only):

- Return `RouterResult` = `SafeResult` plus a `{ status: "pending" }` arm for the pre-`isReady` first render of a statically optimized page. Handle all three statuses. No `OrThrow` variants exist, by design. Same `{ select }` option.

Testing — `import { ParamourTestingProvider, withParamourTesting } from "@paramour-js/next/testing"`: overrides the hooks' framework reads without mocking `next/*` modules. `withParamourTesting({ pathname: "/product/42", params: { id: "42" }, search: "?q=hi" })` is testing-library's `wrapper`; options also cover `isReady`, `mounted`, `onReplace`, `params: null`.

## Errors

All library throws are `ParamourError` subclasses (brand-hardened `instanceof`): `ParseError` (one wire value failed its grammar/schema; `.catch()`-recoverable), `SerializeError` (link-build time), `ParamsDecodeError`/`SearchDecodeError` (aggregate, `.issues: Issue[]` with `key`/`message`/`reason`/`expected`/`wire`), `SearchSourceError` (malformed source under a declared key). `safeParse*`/`safeDecode*`/hooks convert only the decode errors into the error arm — contract violations stay thrown.
