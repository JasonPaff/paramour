# @paramour-js/eslint-plugin

## 0.1.0

### Minor Changes

- [#29](https://github.com/JasonPaff/paramour/pull/29) [`9588229`](https://github.com/JasonPaff/paramour/commit/95882294e0a0b47374332f7cbf42e8dd7c3f230c) Thanks [@JasonPaff](https://github.com/JasonPaff)! - New package: ESLint plugin with `paramour/no-raw-hrefs`, which flags raw string paths in `next/link` hrefs, `useRouter()` navigation calls (including the destructured form), and `redirect`/`permanentRedirect` — the places where paramour's typed `href()` building is silently bypassed. Ships a flat-config `recommended` preset at `warn` severity and an `ignorePaths` option (boundary-aware path prefixes) for incremental migration.
