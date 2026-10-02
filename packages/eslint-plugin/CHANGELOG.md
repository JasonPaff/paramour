# @paramour-js/eslint-plugin

## 1.0.0-rc.1

### Patch Changes

- [#73](https://github.com/JasonPaff/paramour/pull/73) [`3b9d326`](https://github.com/JasonPaff/paramour/commit/3b9d326d0545420a467fe185c3d5f5cae01ef97e) Thanks [@JasonPaff](https://github.com/JasonPaff)! - `no-raw-hrefs` no longer reports paths under `/api` (`/api`, `/api/auth/signin`, `/api?x=1`, but not `/apiary`). They point at route handlers, which `href()` cannot build because the route registry lists only pages, so the warning had no fix. The exemption needs no configuration and applies in addition to `ignorePaths`.

## 1.0.0-rc.0

### Major Changes

- [#65](https://github.com/JasonPaff/paramour/pull/65) [`1ff43d2`](https://github.com/JasonPaff/paramour/commit/1ff43d21a7be809fd9aadc296a7b5384049d520e) Thanks [@JasonPaff](https://github.com/JasonPaff)! - 1.0 release candidate. The public API is frozen: from 1.0 on, semver applies as the Stability & versioning page describes, and breaking changes wait for 2.0. This release adds no changes beyond 0.11.3. Install it with the `rc` dist-tag (`npm install paramour@rc`) and report anything that should change before 1.0.0 final.

## 0.11.3

## 0.11.2

## 0.11.1

## 0.11.0

## 0.10.0

## 0.9.0

### Minor Changes

- [#45](https://github.com/JasonPaff/paramour/pull/45) [`bf41492`](https://github.com/JasonPaff/paramour/commit/bf414922039b6dab862909d23a7db4264161899d) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Two new rules catch misuses of paramour's own API that compile but misbehave. Both are in `recommended` at `warn`.

  - **`no-impure-value-defaults`** flags clock or random reads (`new Date()`, `Date.now()`, `Math.random()`, `performance.now()`, `crypto.randomUUID()`, `Temporal.Now.*()`, …) in a `p.*` codec's value-form `.default()` or `.catch()`. The value is evaluated once at module load and then frozen, and because value defaults drive URL elision, links elide against the stale value. The rule offers an editor suggestion to switch to the factory form (`() => new Date()`). It is a suggestion rather than an autofix because factory defaults never elide and `@paramour-js/nuqs` types them as nullable.
  - **`no-parse-context-in-get-static-props`** flags `route.parseContext()` / `safeParseContext()` inside `getStaticProps`, where the context has no query string and the call always fails. The message names the replacement: `decodeParams` / `safeDecodeParams(route, ctx.params ?? {})`.

- [#45](https://github.com/JasonPaff/paramour/pull/45) [`bf41492`](https://github.com/JasonPaff/paramour/commit/bf414922039b6dab862909d23a7db4264161899d) Thanks [@JasonPaff](https://github.com/JasonPaff)! - `no-raw-hrefs` now audits six surfaces spanning both routers — the write-side bypass surfaces design-15 deferred, plus the ones Next has grown since.

  - **Pages router** — `useRouter` from `next/router` (variable, destructured, and namespace forms) and the static `Router.push`/`replace`/`prefetch` form on its default export now fire alongside the App Router surfaces.
  - **`UrlObject` form** — `href={{ pathname: "/foo" }}` on `Link` (and configured wrappers) and `router.push({ pathname: "/foo" })` are flagged on the `pathname`; `ignorePaths` applies to it identically.
  - **`linkComponents` option** — teaches the rule design-system `Link` wrappers via `{ name, source, prop? }` entries, where `name` is the _imported_ name (`"default"` for a default export) so aliases still match, and `prop` defaults to `"href"`.
  - **`<Form action>`** — string actions on `Form` from `next/form`; function values (server actions) never fire.
  - **`NextResponse.redirect` / `rewrite`** — raw internal paths as the direct argument or inside an inline `new URL("/path", base)`; the message nudges `new URL(href(route, …), request.url)`. Absolute URLs and `URL`-typed variables stay exempt.
  - Extensionful module spellings (`next/link.js`, `next/navigation.js`) now match at every `no-raw-hrefs` surface, closing a gap with the other rules.

### Patch Changes

- [#49](https://github.com/JasonPaff/paramour/pull/49) [`d434759`](https://github.com/JasonPaff/paramour/commit/d434759481c1b9e4b420909d40fc34ac3738aba7) Thanks [@JasonPaff](https://github.com/JasonPaff)! - `meta.version` now reports the installed package version. It was hardcoded as `0.1.0`, which went stale and fed ESLint's cache keys.

## 0.8.0

### Minor Changes

- [#43](https://github.com/JasonPaff/paramour/pull/43) [`622bb4d`](https://github.com/JasonPaff/paramour/commit/622bb4d2809d42859844fbbf1a5ffdce2924c0dd) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Two new rules complete the bypass audit in both directions, and the existing rule's messages now name the real API.

  - **`no-raw-param-reads`** — the read-side twin of `no-raw-hrefs`. Flags `useSearchParams()` / `useParams()` imported from `next/navigation` (nudging `useSearch(route)` / `useRouteParams(route)` from `@paramour-js/next/app`) and `router.query` on a `next/router` `useRouter()` router, including the direct-call and destructured forms (nudging the `@paramour-js/next/pages` hooks). An `allow` option (`"routerQuery" | "useParams" | "useSearchParams"`) switches a surface off wholesale.
  - **`no-href-arithmetic`** — flags string content appended after an `href()` result (`href(route) + "?tab=1"`, `` `${href(route)}/reviews` ``); prefix-only concatenation (`origin + href(route)`) stays legal. The pure hash case is the plugin's first autofix: `href(route) + "#top"` rewrites to `href(route, { hash: "top" })` when the options provably carry no `hash`.
  - Both rules ship in `configs.recommended` at `warn`.
  - `no-raw-hrefs` messages now say `href(route, …)` — there is no `route.href()` method to point at.

## 0.7.0

### Minor Changes

- [#41](https://github.com/JasonPaff/paramour/pull/41) [`5f348a7`](https://github.com/JasonPaff/paramour/commit/5f348a7cdee69a5e29903ecd5ec17372a4898bf0) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Lockstep versioning: all published packages now share one version via a changesets fixed group and release together. The devtools package is renamed from `@paramour-js/devtools` to `@paramour-js/devtools-panel` — the old name's version history (1.0.0–6.0.0, the product of a peer-range bump loop) is retired and the old package is deprecated/unpublished on npm. Its peer ranges on `paramour` and `@paramour-js/next` are now wide static ranges (`>=0.6.0`); the same-version releases of the fixed group are the actual compatibility contract.

## 0.1.0

### Minor Changes

- [#29](https://github.com/JasonPaff/paramour/pull/29) [`9588229`](https://github.com/JasonPaff/paramour/commit/95882294e0a0b47374332f7cbf42e8dd7c3f230c) Thanks [@JasonPaff](https://github.com/JasonPaff)! - New package: ESLint plugin with `paramour/no-raw-hrefs`, which flags raw string paths in `next/link` hrefs, `useRouter()` navigation calls (including the destructured form), and `redirect`/`permanentRedirect` — the places where paramour's typed `href()` building is silently bypassed. Ships a flat-config `recommended` preset at `warn` severity and an `ignorePaths` option (boundary-aware path prefixes) for incremental migration.
