---
"paramour": patch
---

`.catch()` on a required or defaulted codec now rejects an `undefined` fallback at compile time even when the codec's output type includes `undefined` (for example `p.custom<string | undefined>`). That chain already threw at runtime; only an `.optional()` codec may recover to absent.
