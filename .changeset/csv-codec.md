---
"@paramour-js/next": patch
"paramour": minor
---

New `p.csv(element?)` codec: a comma-separated scalar list in ONE wire value.

- Arity-"single", so the full modifier set applies — `.optional()`, `.default([])` (with D8 elision: "no tags" is a bare URL), `.catch()` — unlike `p.stringArray()`'s repeated-key format, which stays first-class for form-shaped interop.
- Typed elements by composition: `p.csv(p.integer())` is `number[]` on the wire as `1,2,3`; the element must be an unmodified base scalar (presence, default, and catch belong to the list — modified elements fail to compile, nested csv throws at construction).
- Strict grammar: the empty wire string is `[]`; empty segments (`a,,b`, trailing commas) are `ParseError`s, recoverable via the list's `.catch()`.
- Serialize-side collision guard: an element serializing to the empty string or containing a comma is a loud `SerializeError` at link-build time — round-trip fidelity over silent corruption.
- Reflection: `describeCodec` exposes a nested `element` description (`CodecDescription.element`), and `paramour list` renders `csv<integer>`-style shapes (the `@paramour-js/next` change).
