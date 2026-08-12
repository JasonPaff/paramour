# @paramour-js/eslint-plugin

ESLint plugin for [paramour](https://paramour.dev). A raw string href — `<Link href="/users/123">` — or a raw param read — `useSearchParams()`, `router.query` — compiles, renders, and silently bypasses everything paramour does: the route's codecs never run, params are never validated, and typos ship. In a codebase mid-migration this is the default failure mode. This plugin finds every place paramour never sees, in both directions, and guards the integrity of what `href()` builds.

Docs: <https://paramour.dev/docs/reference/eslint-plugin>

## Install

```sh
pnpm add -D @paramour-js/eslint-plugin
```

Requires ESLint 9+ with flat config.

## Usage

Spread the recommended preset into your `eslint.config.js`:

```js
import paramour from "@paramour-js/eslint-plugin";

export default [
  // ...your other config
  paramour.configs.recommended,
];
```

Or wire the rules manually:

```js
import paramour from "@paramour-js/eslint-plugin";

export default [
  {
    plugins: { paramour },
    rules: {
      "paramour/no-href-arithmetic": "warn",
      "paramour/no-raw-hrefs": "warn",
      "paramour/no-raw-param-reads": "warn",
    },
  },
];
```

The preset registers every rule at `warn` — it is a migration nudge, not a correctness gate. Once your routes are migrated, promote any rule individually:

```js
rules: { "paramour/no-raw-hrefs": "error" }
```

## Rules

- [`no-raw-hrefs`](https://paramour.dev/docs/reference/eslint-plugin#no-raw-hrefs) — raw string paths flowing into `<Link href>`, `router.push`/`replace`/`prefetch`, and `redirect`/`permanentRedirect`.
- [`no-raw-param-reads`](https://paramour.dev/docs/reference/eslint-plugin#no-raw-param-reads) — raw reads through `useSearchParams()`/`useParams()` from `next/navigation` and `router.query` from `next/router`.
- [`no-href-arithmetic`](https://paramour.dev/docs/reference/eslint-plugin#no-href-arithmetic) — string content appended after an `href()` result; the pure-hash case is autofixed to `href()`'s `hash` option.

### no-raw-hrefs

Reports string literals (and expression-free template literals) starting with `/` in three Next.js App Router surfaces: the `href` attribute of `Link` imported from `next/link` (any local name — imports are tracked, not names matched); the first argument of `push`, `replace`, and `prefetch` on a router obtained from `next/navigation`'s `useRouter()` — including the destructured form `const { push } = useRouter()`; and arguments to `redirect` and `permanentRedirect` imported from `next/navigation`.

External URLs (`https://…`, protocol-relative `//…`), fragments (`#…`), `mailto:`/`tel:`, relative paths, and empty strings are ignored. `ignorePaths` (path-segment prefixes, not substrings or globs) exempts sections a migration has not reached yet:

```js
rules: {
  "paramour/no-raw-hrefs": ["warn", { ignorePaths: ["/legacy", "/admin"] }],
}
```

### no-raw-param-reads

The read-side twin: reports `useSearchParams()` / `useParams()` imported from `next/navigation` (nudging `useSearch(route)` / `useRouteParams(route)` from `@paramour-js/next/app`) and `router.query` on a `next/router` `useRouter()` router, including `useRouter().query` and destructured forms (nudging the `@paramour-js/next/pages` hooks). The `allow` option (`"routerQuery" | "useParams" | "useSearchParams"`) switches a surface off wholesale; one-off legitimate reads (e.g. untyped `utm_*` forwarding) use a targeted disable comment.

### no-href-arithmetic

Reports content appended after an `href()` result — `href(route) + "?tab=1"`, `` `${href(route)}/reviews` `` — which reintroduces unvalidated URL content through the back door. Prefixing is fine (`origin + href(route)` is the legitimate absolute-URL pattern). The pure hash case (`href(route) + "#top"`) is autofixed to `href(route, { hash: "top" })`; `?` suffixes are message-only because the appended query needs a codec key in the route's `search` config. No options.

## License

MIT
