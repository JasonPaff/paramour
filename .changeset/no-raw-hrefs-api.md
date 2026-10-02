---
"@paramour-js/eslint-plugin": patch
---

`no-raw-hrefs` no longer reports paths under `/api` (`/api`, `/api/auth/signin`, `/api?x=1`, but not `/apiary`). They point at route handlers, which `href()` cannot build because the route registry lists only pages, so the warning had no fix. The exemption needs no configuration and applies in addition to `ignorePaths`.
