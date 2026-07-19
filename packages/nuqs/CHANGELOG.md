# @paramour-js/nuqs

## 0.2.0

### Minor Changes

- [#24](https://github.com/JasonPaff/paramour/pull/24) [`bfd1585`](https://github.com/JasonPaff/paramour/commit/bfd158538fba154bfbbbe23268804a8e35025d6f) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Declare `engines.node: ">=22.13.0"` in every published package. Node 18 is EOL and was never executed by CI; the supported floor is now Node 22.13 (22 LTS), and CI runs the runtime test suite on exactly that version.

### Patch Changes

- Updated dependencies [[`981759c`](https://github.com/JasonPaff/paramour/commit/981759c83057867c2d27b5a5704cc44987e6d828), [`5c6bb83`](https://github.com/JasonPaff/paramour/commit/5c6bb83f43b271690db2dcf825fe0b843cf62787), [`bfd1585`](https://github.com/JasonPaff/paramour/commit/bfd158538fba154bfbbbe23268804a8e35025d6f)]:
  - paramour@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`3673256`](https://github.com/JasonPaff/paramour/commit/36732565dd8e37d9daea15c19ac5216148d68675)]:
  - paramour@0.4.0

## 0.1.0

### Minor Changes

- [#14](https://github.com/JasonPaff/paramour/pull/14) [`f8bc826`](https://github.com/JasonPaff/paramour/commit/f8bc82656031cd74bbae00c49d24ff5da56ce7ab) Thanks [@JasonPaff](https://github.com/JasonPaff)! - New `@paramour-js/nuqs` adapter: derive nuqs parsers from paramour search codecs. `nuqsParsers(route | searchConfig)` and `nuqsParser(codec)` read presence, defaults, catch recovery, and serializer state off the codecs — value-form defaults become non-nullable `withDefault` parsers, factory defaults stay honestly nullable, `.catch()` recovers before nuqs's null, arity-"many" codecs derive repeated-key multi parsers, and equality is wire-form so clearOnDefault agrees with paramour's URL elision by construction. Shapes with no faithful nuqs twin (null-including outputs, rawSearch routes, search-less routes) are rejected at compile time and backed by runtime `ParamourError`s.

### Patch Changes

- Updated dependencies [[`ffd6759`](https://github.com/JasonPaff/paramour/commit/ffd6759f5bcebcef3f8561c18b82e38534ac54c3), [`f8bc826`](https://github.com/JasonPaff/paramour/commit/f8bc82656031cd74bbae00c49d24ff5da56ce7ab), [`c828534`](https://github.com/JasonPaff/paramour/commit/c828534b15a7724afe0e1202613b0ee9dab76bb3)]:
  - paramour@0.3.0
