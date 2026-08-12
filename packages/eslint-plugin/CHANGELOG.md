# @paramour-js/eslint-plugin

## 0.7.0

### Minor Changes

- [#41](https://github.com/JasonPaff/paramour/pull/41) [`5f348a7`](https://github.com/JasonPaff/paramour/commit/5f348a7cdee69a5e29903ecd5ec17372a4898bf0) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Lockstep versioning: all published packages now share one version via a changesets fixed group and release together. The devtools package is renamed from `@paramour-js/devtools` to `@paramour-js/devtools-panel` — the old name's version history (1.0.0–6.0.0, the product of a peer-range bump loop) is retired and the old package is deprecated/unpublished on npm. Its peer ranges on `paramour` and `@paramour-js/next` are now wide static ranges (`>=0.6.0`); the same-version releases of the fixed group are the actual compatibility contract.

## 0.1.0

### Minor Changes

- [#29](https://github.com/JasonPaff/paramour/pull/29) [`9588229`](https://github.com/JasonPaff/paramour/commit/95882294e0a0b47374332f7cbf42e8dd7c3f230c) Thanks [@JasonPaff](https://github.com/JasonPaff)! - New package: ESLint plugin with `paramour/no-raw-hrefs`, which flags raw string paths in `next/link` hrefs, `useRouter()` navigation calls (including the destructured form), and `redirect`/`permanentRedirect` — the places where paramour's typed `href()` building is silently bypassed. Ships a flat-config `recommended` preset at `warn` severity and an `ignorePaths` option (boundary-aware path prefixes) for incremental migration.
