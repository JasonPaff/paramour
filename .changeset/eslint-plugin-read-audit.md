---
"@paramour-js/eslint-plugin": minor
---

Two new rules complete the bypass audit in both directions, and the existing rule's messages now name the real API.

- **`no-raw-param-reads`** — the read-side twin of `no-raw-hrefs`. Flags `useSearchParams()` / `useParams()` imported from `next/navigation` (nudging `useSearch(route)` / `useRouteParams(route)` from `@paramour-js/next/app`) and `router.query` on a `next/router` `useRouter()` router, including the direct-call and destructured forms (nudging the `@paramour-js/next/pages` hooks). An `allow` option (`"routerQuery" | "useParams" | "useSearchParams"`) switches a surface off wholesale.
- **`no-href-arithmetic`** — flags string content appended after an `href()` result (`href(route) + "?tab=1"`, `` `${href(route)}/reviews` ``); prefix-only concatenation (`origin + href(route)`) stays legal. The pure hash case is the plugin's first autofix: `href(route) + "#top"` rewrites to `href(route, { hash: "top" })` when the options provably carry no `hash`.
- Both rules ship in `configs.recommended` at `warn`.
- `no-raw-hrefs` messages now say `href(route, …)` — there is no `route.href()` method to point at.
