# @paramour-js/devtools-panel

## 0.8.0

## 0.7.0

### Minor Changes

- [#41](https://github.com/JasonPaff/paramour/pull/41) [`5f348a7`](https://github.com/JasonPaff/paramour/commit/5f348a7cdee69a5e29903ecd5ec17372a4898bf0) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Lockstep versioning: all published packages now share one version via a changesets fixed group and release together. The devtools package is renamed from `@paramour-js/devtools` to `@paramour-js/devtools-panel` — the old name's version history (1.0.0–6.0.0, the product of a peer-range bump loop) is retired and the old package is deprecated/unpublished on npm. Its peer ranges on `paramour` and `@paramour-js/next` are now wide static ranges (`>=0.6.0`); the same-version releases of the fixed group are the actual compatibility contract.
