---
"@paramour-js/eslint-plugin": minor
---

Two new rules catch misuses of paramour's own API that compile but misbehave. Both are in `recommended` at `warn`.

- **`no-impure-value-defaults`** flags clock or random reads (`new Date()`, `Date.now()`, `Math.random()`, `performance.now()`, `crypto.randomUUID()`, `Temporal.Now.*()`, …) in a `p.*` codec's value-form `.default()` or `.catch()`. The value is evaluated once at module load and then frozen, and because value defaults drive URL elision, links elide against the stale value. The rule offers an editor suggestion to switch to the factory form (`() => new Date()`). It is a suggestion rather than an autofix because factory defaults never elide and `@paramour-js/nuqs` types them as nullable.
- **`no-parse-context-in-get-static-props`** flags `route.parseContext()` / `safeParseContext()` inside `getStaticProps`, where the context has no query string and the call always fails. The message names the replacement: `decodeParams` / `safeDecodeParams(route, ctx.params ?? {})`.
