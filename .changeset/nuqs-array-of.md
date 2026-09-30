---
"@paramour-js/nuqs": minor
---

Add `nuqsArrayOf(element?)`, a one-key list codec in nuqs's `parseAsArrayOf` wire format. It escapes an in-element comma as `%2C` and drops elements that fail to parse, so routes can keep reading URLs nuqs already wrote, including lists of free-text values that contain commas. It refuses to write the two values nuqs's format can't round-trip. The adapter docs also cover defaults computed at render time: call `withDefault` on the derived parser.
