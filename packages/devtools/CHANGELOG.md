# @paramour-js/devtools

## 6.0.0

### Patch Changes

- Updated dependencies [[`edcb3cf`](https://github.com/JasonPaff/paramour/commit/edcb3cfd5572081ad83b3be9ef888bc93637bdd4), [`edcb3cf`](https://github.com/JasonPaff/paramour/commit/edcb3cfd5572081ad83b3be9ef888bc93637bdd4), [`edcb3cf`](https://github.com/JasonPaff/paramour/commit/edcb3cfd5572081ad83b3be9ef888bc93637bdd4)]:
  - @paramour-js/next@0.5.0

## 5.0.0

### Minor Changes

- [#35](https://github.com/JasonPaff/paramour/pull/35) [`9cf5a70`](https://github.com/JasonPaff/paramour/commit/9cf5a70ac249e6b28c997b8aa5f6d364e174ec01) Thanks [@JasonPaff](https://github.com/JasonPaff)! - The Issues table renders the structured issue fields shipped in core: a `wire` column (the offending wire value, JSON-quoted so an empty string stays visible) and an `expected` column (the codec's bare shape label), with an em dash marking meaningful absence. The edit-preview's foreign-throw fallback issue is enriched the same way — `expected` from the codec in hand, `wire` from a scalar draft.

### Patch Changes

- Updated dependencies [[`9cf5a70`](https://github.com/JasonPaff/paramour/commit/9cf5a70ac249e6b28c997b8aa5f6d364e174ec01)]:
  - paramour@0.6.0
  - @paramour-js/next@0.4.1

## 4.0.0

### Patch Changes

- Updated dependencies [[`7528564`](https://github.com/JasonPaff/paramour/commit/7528564aa50bd961cc62222b6bc50477d3ba20ae)]:
  - @paramour-js/next@0.4.0

## 3.0.1

### Patch Changes

- [#27](https://github.com/JasonPaff/paramour/pull/27) [`eff721a`](https://github.com/JasonPaff/paramour/commit/eff721a2f7b49fb5c49663742bf0c8d0af504b35) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Point package metadata at the paramour.dev docs site: real READMEs for every
  published package, `homepage` deep links into the docs, and npm keywords.
- Updated dependencies [[`eff721a`](https://github.com/JasonPaff/paramour/commit/eff721a2f7b49fb5c49663742bf0c8d0af504b35)]:
  - paramour@0.5.1
  - @paramour-js/next@0.3.1

## 3.0.0

### Minor Changes

- [#24](https://github.com/JasonPaff/paramour/pull/24) [`bfd1585`](https://github.com/JasonPaff/paramour/commit/bfd158538fba154bfbbbe23268804a8e35025d6f) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Declare `engines.node: ">=22.13.0"` in every published package. Node 18 is EOL and was never executed by CI; the supported floor is now Node 22.13 (22 LTS), and CI runs the runtime test suite on exactly that version.

### Patch Changes

- [#20](https://github.com/JasonPaff/paramour/pull/20) [`981759c`](https://github.com/JasonPaff/paramour/commit/981759c83057867c2d27b5a5704cc44987e6d828) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Import `parseValue`/`foreignMessage` from the new `paramour/internal` entry instead of the main barrel. Requires `paramour` >= 0.5.0.

- Updated dependencies [[`981759c`](https://github.com/JasonPaff/paramour/commit/981759c83057867c2d27b5a5704cc44987e6d828), [`5c6bb83`](https://github.com/JasonPaff/paramour/commit/5c6bb83f43b271690db2dcf825fe0b843cf62787), [`5c6bb83`](https://github.com/JasonPaff/paramour/commit/5c6bb83f43b271690db2dcf825fe0b843cf62787), [`bfd1585`](https://github.com/JasonPaff/paramour/commit/bfd158538fba154bfbbbe23268804a8e35025d6f), [`981759c`](https://github.com/JasonPaff/paramour/commit/981759c83057867c2d27b5a5704cc44987e6d828)]:
  - paramour@0.5.0
  - @paramour-js/next@0.3.0

## 2.0.0

### Patch Changes

- Updated dependencies [[`3673256`](https://github.com/JasonPaff/paramour/commit/36732565dd8e37d9daea15c19ac5216148d68675)]:
  - paramour@0.4.0
  - @paramour-js/next@0.2.1

## 1.0.0

### Minor Changes

- [#15](https://github.com/JasonPaff/paramour/pull/15) [`c828534`](https://github.com/JasonPaff/paramour/commit/c828534b15a7724afe0e1202613b0ee9dab76bb3) Thanks [@JasonPaff](https://github.com/JasonPaff)! - New `@paramour-js/devtools` package: a TanStack Devtools panel for paramour routes. The `@paramour-js/next` hooks now emit one observation per decode change — the live route object, the wire snapshot the decode saw, the full pre-`select` `SafeResult` (or `pending`), which hook reported, and a `navigate` capability — into a dependency-free `Symbol.for("paramour.devtools.seam")` global slot, with every emit site behind a `process.env.NODE_ENV !== "production"` guard and `sideEffects: false` so production bundles erase it all; the seam's types publish via the new types-only `@paramour-js/next/devtools-seam` subpath. The panel shows a session sidebar plus a current-route inspector — per-key wire vs parsed tables with codec shapes from `describeRoute`, default/catch attribution, prominent `issues[]`, and Pages `pending` as a first-class status — and makes search params editable: per-kind widgets with live single-key validation, a raw-wire mode for reproducing invalid values, and commit-to-push through `buildSearchString` (spaces stay `%20`) and the emitting hook's router. Core gains `parseValue(codec, raw)`, the parse twin of `serializeValue`, so tooling can probe a parse without `.catch()` recovery.

### Patch Changes

- Updated dependencies [[`ffd6759`](https://github.com/JasonPaff/paramour/commit/ffd6759f5bcebcef3f8561c18b82e38534ac54c3), [`f8bc826`](https://github.com/JasonPaff/paramour/commit/f8bc82656031cd74bbae00c49d24ff5da56ce7ab), [`c828534`](https://github.com/JasonPaff/paramour/commit/c828534b15a7724afe0e1202613b0ee9dab76bb3)]:
  - @paramour-js/next@0.2.0
  - paramour@0.3.0
