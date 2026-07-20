---
"@paramour-js/eslint-plugin": minor
---

New package: ESLint plugin with `paramour/no-raw-hrefs`, which flags raw string paths in `next/link` hrefs, `useRouter()` navigation calls (including the destructured form), and `redirect`/`permanentRedirect` — the places where paramour's typed `href()` building is silently bypassed. Ships a flat-config `recommended` preset at `warn` severity and an `ignorePaths` option (boundary-aware path prefixes) for incremental migration.
