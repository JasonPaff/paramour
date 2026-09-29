---
"paramour": minor
"@paramour-js/nuqs": minor
---

**`.optional()` codecs can recover a bad value to absent.** `.catch()` on an `.optional()` codec now accepts `undefined` (or a factory returning it), so a malformed value decodes as `undefined` instead of failing the decode: `p.enum(["gold", "silver"]).optional().catch(undefined)`. Use it when a bad value should mean "nothing selected" and no in-domain value says that. Required and defaulted codecs still need a value fallback. On them, `.catch(undefined)` fails to compile and throws a `ParamourError` at runtime. Apply `.optional()` first. `nuqsParser` maps the absent fallback to nuqs's `null`.
