---
"paramour": minor
---

Type-level: `.default()` now has two overloads (value vs factory form) driving a literal-typed `~defaultElides` via a new fifth `Codec` type parameter, `E extends boolean = boolean`. Runtime behavior is unchanged; derived surfaces (`@paramour-js/nuqs`) can now distinguish value-form defaults (non-nullable, D8-eliding) from factory defaults (never eliding) in the type system. Existing `Codec<Out, P, C, A>` references remain valid — the new parameter defaults to `boolean`.
