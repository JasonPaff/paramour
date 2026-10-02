---
"@paramour-js/next": patch
---

`@paramour-js/next/app` now loads under Node's ESM resolver. It imported the bare `next/navigation`, which Node cannot resolve because `next` publishes no `exports` map, so any Vitest test rendering a component that used the app hooks failed with `ERR_MODULE_NOT_FOUND` unless `@paramour-js/next` was listed in `server.deps.inline`. The entry now imports `next/navigation.js`, as the pages entry already imports `next/router.js`; bundled builds resolve to the same module. The testing guide also covers setting `__NEXT_TRAILING_SLASH` so `<Link>` keeps the slash from `trailingSlash: true` routes in tests.
