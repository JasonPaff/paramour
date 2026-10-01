---
"@paramour-js/next": minor
---

`paramour doctor` gains a warn-level `trailing slash` check: it lists each route definition whose `trailingSlash` option disagrees with `trailingSlash` in `next.config`. It reports only when definitions exist and the config value can be read statically.
