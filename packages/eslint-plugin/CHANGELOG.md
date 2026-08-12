# @paramour-js/eslint-plugin

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
