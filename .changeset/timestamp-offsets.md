---
"paramour": minor
---

`p.timestamp()` now accepts `±HH:MM` UTC offsets on input, alongside `Z`. `2026-07-18T14:30:00+02:00` decodes to the same instant as `2026-07-18T12:30:00Z`. Output is unchanged: always UTC `Date#toISOString()`, so every instant still has exactly one URL. Offsets outside `00:00`–`23:59` are rejected, and so is any instant that falls outside years 0000–9999 once the offset is applied. This finalizes the 1.0 grammar; previously, offset timestamps failed to parse (and fell back to `.catch()`).
