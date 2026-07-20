# @paramour-js/eslint-plugin

ESLint plugin for [paramour](https://paramour.dev). A raw string href — `<Link href="/users/123">`, `router.push("/shop?page=2")`, `redirect("/login")` — compiles, navigates, and silently bypasses everything paramour does: the route's codecs never run, params are never validated, and typos ship. In a codebase mid-migration this is the default failure mode. This plugin finds every unmigrated link.

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

Or wire the rule manually:

```js
import paramour from "@paramour-js/eslint-plugin";

export default [
  {
    plugins: { paramour },
    rules: {
      "paramour/no-raw-hrefs": "warn",
    },
  },
];
```

The preset registers the rule at `warn` — it is a migration nudge, not a correctness gate. Once your routes are migrated, promote it in one line:

```js
rules: { "paramour/no-raw-hrefs": "error" }
```

## What it flags

`paramour/no-raw-hrefs` reports string literals (and expression-free template literals) starting with `/` in three Next.js App Router surfaces:

1. the `href` attribute of `Link` imported from `next/link` (any local name — imports are tracked, not names matched);
2. the first argument of `push`, `replace`, and `prefetch` on a router obtained from `next/navigation`'s `useRouter()` — including the destructured form `const { push } = useRouter()`;
3. arguments to `redirect` and `permanentRedirect` imported from `next/navigation`.

External URLs (`https://…`, protocol-relative `//…`), fragments (`#…`), `mailto:`/`tel:`, relative paths, and empty strings never start with `/` (or are explicitly exempt) and are ignored.

Deliberately out of scope in v1: dynamic strings (`"/users/" + id`, template literals with expressions), the Pages router (`next/router`), the `UrlObject` href form (`href={{ pathname: "/foo" }}`), `Link` re-exported through a wrapper component, and a router instance passed across function or prop boundaries.

## Options

| Option        | Type       | Default | Description                                 |
| ------------- | ---------- | ------- | ------------------------------------------- |
| `ignorePaths` | `string[]` | `[]`    | Path prefixes to exempt during a migration. |

`ignorePaths` matches path-segment prefixes, not raw substrings: `"/legacy"` exempts `/legacy`, `/legacy/old`, `/legacy?tab=1`, and `/legacy#top`, but **not** `/legacybar`. A trailing slash is ignored (`"/legacy/"` behaves like `"/legacy"`); `"/"` exempts everything.

```js
rules: {
  "paramour/no-raw-hrefs": ["warn", { ignorePaths: ["/legacy", "/admin"] }],
}
```

## License

MIT
