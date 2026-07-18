# @paramour-js/nuqs

## 0.1.0

### Minor Changes

- [#14](https://github.com/JasonPaff/paramour/pull/14) [`f8bc826`](https://github.com/JasonPaff/paramour/commit/f8bc82656031cd74bbae00c49d24ff5da56ce7ab) Thanks [@JasonPaff](https://github.com/JasonPaff)! - New `@paramour-js/nuqs` adapter: derive nuqs parsers from paramour search codecs. `nuqsParsers(route | searchConfig)` and `nuqsParser(codec)` read presence, defaults, catch recovery, and serializer state off the codecs — value-form defaults become non-nullable `withDefault` parsers, factory defaults stay honestly nullable, `.catch()` recovers before nuqs's null, arity-"many" codecs derive repeated-key multi parsers, and equality is wire-form so clearOnDefault agrees with paramour's URL elision by construction. Shapes with no faithful nuqs twin (null-including outputs, rawSearch routes, search-less routes) are rejected at compile time and backed by runtime `ParamourError`s.

### Patch Changes

- Updated dependencies [[`ffd6759`](https://github.com/JasonPaff/paramour/commit/ffd6759f5bcebcef3f8561c18b82e38534ac54c3), [`f8bc826`](https://github.com/JasonPaff/paramour/commit/f8bc82656031cd74bbae00c49d24ff5da56ce7ab), [`c828534`](https://github.com/JasonPaff/paramour/commit/c828534b15a7724afe0e1202613b0ee9dab76bb3)]:
  - paramour@0.3.0
