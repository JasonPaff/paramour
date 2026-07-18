---
"paramour": minor
---

Close the nuqs parser-parity gaps (design-13):

- New `p.array(element?)` — a typed repeated-key list codec (`?ids=1&ids=2`), generalizing the old `p.stringArray()` by element composition: any unmodified base scalar codec (including `p.csv(...)`) works as the element; omitted, elements are strings.
- New `p.index(schema?)` — a 1-based-on-wire / 0-based-in-memory integer for pagination (`?page=1` ↔ index 0). Stricter than nuqs's `parseAsIndex`: wire values below 1 are a `ParseError` (recoverable via `.catch()`), and negative in-memory indexes fail loud with a `SerializeError` at link-build time.
- BREAKING: `p.stringArray()` is removed — `p.array()` with no argument is the exact replacement.
- `describeCodec` reflects `p.array`'s element (kind `"array"` plus a nested `element` description); `formatCodecDescription` renders repeated-key lists as `integer[]`/`enum(a|b)[]`-style labels.
