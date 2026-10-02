---
"@paramour-js/nuqs": patch
---

`nuqsArrayOf` reflects its element in its label (`nuqsArrayOf<integer>` instead of `nuqs array`), so `paramour list` and the devtools panel show what the list holds. Serializing a non-array value from plain JS now throws `Expected an array` like `p.csv`.
