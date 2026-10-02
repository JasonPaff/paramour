---
"@paramour-js/next": patch
---

`paramour list` and `paramour doctor` now resolve tsconfig `paths` aliases when they load route definitions, following `extends` and `baseUrl`. A definition that imports shared codecs through an alias such as `@/lib/codecs` (the `create-next-app` default) used to fail to load and show up as "filesystem only". A module that still fails to load is now reported on one line, without Node's multi-line "Require stack".
