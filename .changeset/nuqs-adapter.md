---
"@paramour-js/nuqs": minor
---

New `@paramour-js/nuqs` adapter: derive nuqs parsers from paramour search codecs. `nuqsParsers(route | searchConfig)` and `nuqsParser(codec)` read presence, defaults, catch recovery, and serializer state off the codecs — value-form defaults become non-nullable `withDefault` parsers, factory defaults stay honestly nullable, `.catch()` recovers before nuqs's null, arity-"many" codecs derive repeated-key multi parsers, and equality is wire-form so clearOnDefault agrees with paramour's URL elision by construction. Shapes with no faithful nuqs twin (null-including outputs, rawSearch routes, search-less routes) are rejected at compile time and backed by runtime `ParamourError`s.
