---
"paramour": patch
---

Fix `rawSearch` producing the bogus issue key `"0"` instead of the `<search>` sentinel for root-level validation issues raised by ArkType.

Standard Schema types `issue.path` as a `ReadonlyArray`, and a `ReadonlyArray` may be an `Array` subclass. ArkType's is (`ReadonlyPath`), and its constructor is variadic. `Array.prototype.map` builds its result via `Symbol.species` — `new ReadonlyPath(0)` — so mapping over an _empty_ path array yielded the one-element array `[0]`, which then joined to the key `"0"`. Every array paramour receives from a validator is now copied with `Array.from`, which ignores `Symbol.species`. The same hardening is applied to the `issues` array in `p.*` schema refinements.

Zod and Valibot were unaffected. A new cross-validator interop suite exercises zod, valibot, and arktype against every Standard Schema call site — path-segment forms (bare strings vs. Valibot's `{ key }` objects), root-issue shapes (`[]` vs. omitted), and the rejection of async `validate` — so vendor-specific assumptions are now pinned against the real packages rather than hand-rolled stand-ins.
