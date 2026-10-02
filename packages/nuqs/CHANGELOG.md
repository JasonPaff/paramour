# @paramour-js/nuqs

## 1.0.0-rc.1

## 1.0.0-rc.0

### Major Changes

- [#65](https://github.com/JasonPaff/paramour/pull/65) [`1ff43d2`](https://github.com/JasonPaff/paramour/commit/1ff43d21a7be809fd9aadc296a7b5384049d520e) Thanks [@JasonPaff](https://github.com/JasonPaff)! - 1.0 release candidate. The public API is frozen: from 1.0 on, semver applies as the Stability & versioning page describes, and breaking changes wait for 2.0. This release adds no changes beyond 0.11.3. Install it with the `rc` dist-tag (`npm install paramour@rc`) and report anything that should change before 1.0.0 final.

## 0.11.3

## 0.11.2

### Patch Changes

- [#61](https://github.com/JasonPaff/paramour/pull/61) [`521a4b4`](https://github.com/JasonPaff/paramour/commit/521a4b43afc16d28591b2e75d0542d3896e1f6ef) Thanks [@JasonPaff](https://github.com/JasonPaff)! - `nuqsArrayOf` reflects its element in its label (`nuqsArrayOf<integer>` instead of `nuqs array`), so `paramour list` and the devtools panel show what the list holds. Serializing a non-array value from plain JS now throws `Expected an array` like `p.csv`.

## 0.11.1

## 0.11.0

## 0.10.0

### Minor Changes

- [#54](https://github.com/JasonPaff/paramour/pull/54) [`436306e`](https://github.com/JasonPaff/paramour/commit/436306e1a0d37a5c64d8b0704e0f70622c9d94ff) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Add `nuqsArrayOf(element?)`, a one-key list codec in nuqs's `parseAsArrayOf` wire format. It escapes an in-element comma as `%2C` and drops elements that fail to parse, so routes can keep reading URLs nuqs already wrote, including lists of free-text values that contain commas. It refuses to write the two values nuqs's format can't round-trip. The adapter docs also cover defaults computed at render time: call `withDefault` on the derived parser.

- [#52](https://github.com/JasonPaff/paramour/pull/52) [`412366d`](https://github.com/JasonPaff/paramour/commit/412366d6676228568fbd6eee9557a9eb1eda2218) Thanks [@JasonPaff](https://github.com/JasonPaff)! - **`.optional()` codecs can recover a bad value to absent.** `.catch()` on an `.optional()` codec now accepts `undefined` (or a factory returning it), so a malformed value decodes as `undefined` instead of failing the decode: `p.enum(["gold", "silver"]).optional().catch(undefined)`. Use it when a bad value should mean "nothing selected" and no in-domain value says that. Required and defaulted codecs still need a value fallback. On them, `.catch(undefined)` fails to compile and throws a `ParamourError` at runtime. Apply `.optional()` first. `nuqsParser` maps the absent fallback to nuqs's `null`.

## 0.9.0

### Minor Changes

- [#47](https://github.com/JasonPaff/paramour/pull/47) [`11738eb`](https://github.com/JasonPaff/paramour/commit/11738ebe290179e8d75ca0ccbbd8cda133548602) Thanks [@JasonPaff](https://github.com/JasonPaff)! - **Breaking — 1.0 API freeze, part 2: packaging and wiring.**

  - **`paramour` is now a peer dependency** of `@paramour-js/next`, `@paramour-js/nuqs` and `@paramour-js/devtools-panel`. Previously next and nuqs had an exact-pinned regular dependency, which could give an app two copies of core. That broke `ParamourRegister` augmentation and the `Href` brand. Install `paramour` alongside them; the setup docs already say to.
  - **`withTypedRoutes` reads `paramour.config.*`**, the same file the CLI reads. `appDir`, `pagesDir` and `outFile` now apply to `next dev`/`next build` too, so the wrapper and `paramour generate` always write the same artifact. The `outFile` option is removed from `WithTypedRoutesOptions`, which is now just `{ strict? }`; set `outFile` in the config file instead. Next's own `pageExtensions` still decides what counts as a page inside Next. The wrapper warns once if the config file lists different extensions, and a malformed config file throws during config evaluation.
  - **`@paramour-js/next/devtools-seam` declares only types**, so a value import through the types-only entry can no longer type-check. The seam contract is covered by semver. `ParamourObservationBase` is exported. `ParamourHookId` and the observation kinds are documented as open unions, so consumers should keep a default branch.
  - **`RouteCollisionError` extends `ParamourError`**, with a cross-copy `instanceof` brand and a literal `name`.
  - **`paramour doctor`** now checks that `paramour` and `@paramour-js/next` have the same version, since the packages release in lockstep.

### Patch Changes

- [#46](https://github.com/JasonPaff/paramour/pull/46) [`2c857fa`](https://github.com/JasonPaff/paramour/commit/2c857fac3bbd13152726e01283487271b758590d) Thanks [@JasonPaff](https://github.com/JasonPaff)! - **Breaking — 1.0 API freeze, part 1: types and naming.** These changes settle the public type surface before 1.0.

  - **`InferRouteSearch<R>`** (new) is the route-level twin of `InferRouteParams<R>`. Hook signatures, `standardSearchSchema` (`StandardSearchSchema<R>` now takes the route) and the docs use it, so no public signature mentions a route's internal `~search` member anymore. The `~`-prefixed members are documented as outside semver.
  - **Search type helpers renamed.** `InferSearchInput` / `InferSearchOutput` now accept any `search:` slot (a codec map or `rawSearch`). `SearchOutputOf` is removed; use `InferSearchOutput`. `OutputOf` is renamed to `InferCodecOutput`. `RoutePropsInput` / `ParamsPropsInput` / `SearchPropsInput` are renamed to `RoutePropsLike` / `ParamsPropsLike` / `SearchPropsLike`.
  - **`RouteConfig` and `SearchSlot` are exported**, so generic wrappers around `defineAppRoute` / `definePagesRoute` can be written.
  - **Search functions take a route or a config.** `decodeSearch`, `safeDecodeSearch`, `encodeSearch` and `searchToString` accept either one. `decodeSearch`'s `routePath` third argument is removed; pass the route instead, and its path anchors the error.
  - **`SafeResult<T, E>`** gains an error parameter. Params-only surfaces (`safeParseParams`, `safeDecodeParams`, `useRouteParams`) are typed `SafeResult<T, ParamsDecodeError>`, and search-only surfaces use `SearchDecodeError`. `RouterResult<T, E>` follows. Every error class now has a literal `name` (for example `"SearchDecodeError"`) that survives minification. This also makes the two decode errors structurally distinct.
  - **`AnyCodec<Out>`** can be narrowed to one output type. Only `Codec`'s first type parameter is public API; the type-state parameters after it may change in minor releases.
  - **`p.custom` can no longer impersonate built-ins.** Its `kind` is always `"custom"`, and its `label` is reported separately as `CodecDescription.label`. `kind` is now a `CodecKind` union.
  - **`parseValue`** moves from `paramour/internal` to the main entry point, alongside `serializeValue`. `paramour/internal` is now covered by semver within a major.
  - `ParseError`'s `selfDescribing` flag and constructor option are now internal.

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - paramour@0.8.0

## 0.7.0

### Minor Changes

- [#41](https://github.com/JasonPaff/paramour/pull/41) [`5f348a7`](https://github.com/JasonPaff/paramour/commit/5f348a7cdee69a5e29903ecd5ec17372a4898bf0) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Lockstep versioning: all published packages now share one version via a changesets fixed group and release together. The devtools package is renamed from `@paramour-js/devtools` to `@paramour-js/devtools-panel` — the old name's version history (1.0.0–6.0.0, the product of a peer-range bump loop) is retired and the old package is deprecated/unpublished on npm. Its peer ranges on `paramour` and `@paramour-js/next` are now wide static ranges (`>=0.6.0`); the same-version releases of the fixed group are the actual compatibility contract.

### Patch Changes

- Updated dependencies [[`5f348a7`](https://github.com/JasonPaff/paramour/commit/5f348a7cdee69a5e29903ecd5ec17372a4898bf0)]:
  - paramour@0.7.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`9cf5a70`](https://github.com/JasonPaff/paramour/commit/9cf5a70ac249e6b28c997b8aa5f6d364e174ec01)]:
  - paramour@0.6.0

## 0.2.1

### Patch Changes

- [#27](https://github.com/JasonPaff/paramour/pull/27) [`eff721a`](https://github.com/JasonPaff/paramour/commit/eff721a2f7b49fb5c49663742bf0c8d0af504b35) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Point package metadata at the paramour.dev docs site: real READMEs for every
  published package, `homepage` deep links into the docs, and npm keywords.
- Updated dependencies [[`eff721a`](https://github.com/JasonPaff/paramour/commit/eff721a2f7b49fb5c49663742bf0c8d0af504b35)]:
  - paramour@0.5.1

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
