---
"@paramour-js/next": patch
---

Two Next 15 fixes: `@paramour-js/next/pages` no longer fails `next build`
on Next 15 with `ERR_MODULE_NOT_FOUND` for `next/router` (the import is now
the extensionful `next/router.js`, which survives Node ESM resolution when
the package is loaded as an external during page-data collection — no
`transpilePackages` workaround needed), and `paramour doctor`'s versions
check now verifies the installed `paramour` against the exact version
`@paramour-js/next` declares as its dependency instead of warning that the
two packages' own versions differ — they version independently, so the old
"release in lockstep" warning fired on every correct install.
