---
"paramour": minor
"@paramour-js/next": minor
"@paramour-js/devtools-panel": minor
"@paramour-js/nuqs": minor
"@paramour-js/eslint-plugin": minor
---

Lockstep versioning: all published packages now share one version via a changesets fixed group and release together. The devtools package is renamed from `@paramour-js/devtools` to `@paramour-js/devtools-panel` — the old name's version history (1.0.0–6.0.0, the product of a peer-range bump loop) is retired and the old package is deprecated/unpublished on npm. Its peer ranges on `paramour` and `@paramour-js/next` are now wide static ranges (`>=0.6.0`); the same-version releases of the fixed group are the actual compatibility contract.
