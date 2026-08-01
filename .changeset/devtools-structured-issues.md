---
"@paramour-js/devtools": minor
---

The Issues table renders the structured issue fields shipped in core: a `wire` column (the offending wire value, JSON-quoted so an empty string stays visible) and an `expected` column (the codec's bare shape label), with an em dash marking meaningful absence. The edit-preview's foreign-throw fallback issue is enriched the same way — `expected` from the codec in hand, `wire` from a scalar draft.
