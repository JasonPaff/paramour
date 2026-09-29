---
"@paramour-js/eslint-plugin": patch
---

`meta.version` now reports the installed package version. It was hardcoded as `0.1.0`, which went stale and fed ESLint's cache keys.
