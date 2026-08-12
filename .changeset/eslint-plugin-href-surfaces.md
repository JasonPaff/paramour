---
"@paramour-js/eslint-plugin": minor
---

`no-raw-hrefs` now audits six surfaces spanning both routers — the write-side bypass surfaces design-15 deferred, plus the ones Next has grown since.

- **Pages router** — `useRouter` from `next/router` (variable, destructured, and namespace forms) and the static `Router.push`/`replace`/`prefetch` form on its default export now fire alongside the App Router surfaces.
- **`UrlObject` form** — `href={{ pathname: "/foo" }}` on `Link` (and configured wrappers) and `router.push({ pathname: "/foo" })` are flagged on the `pathname`; `ignorePaths` applies to it identically.
- **`linkComponents` option** — teaches the rule design-system `Link` wrappers via `{ name, source, prop? }` entries, where `name` is the _imported_ name (`"default"` for a default export) so aliases still match, and `prop` defaults to `"href"`.
- **`<Form action>`** — string actions on `Form` from `next/form`; function values (server actions) never fire.
- **`NextResponse.redirect` / `rewrite`** — raw internal paths as the direct argument or inside an inline `new URL("/path", base)`; the message nudges `new URL(href(route, …), request.url)`. Absolute URLs and `URL`-typed variables stay exempt.
- Extensionful module spellings (`next/link.js`, `next/navigation.js`) now match at every `no-raw-hrefs` surface, closing a gap with the other rules.
