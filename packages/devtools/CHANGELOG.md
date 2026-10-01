# @paramour-js/devtools-panel

## 0.11.0

## 0.10.0

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

## 0.7.0

### Minor Changes

- [#41](https://github.com/JasonPaff/paramour/pull/41) [`5f348a7`](https://github.com/JasonPaff/paramour/commit/5f348a7cdee69a5e29903ecd5ec17372a4898bf0) Thanks [@JasonPaff](https://github.com/JasonPaff)! - Lockstep versioning: all published packages now share one version via a changesets fixed group and release together. The devtools package is renamed from `@paramour-js/devtools` to `@paramour-js/devtools-panel` — the old name's version history (1.0.0–6.0.0, the product of a peer-range bump loop) is retired and the old package is deprecated/unpublished on npm. Its peer ranges on `paramour` and `@paramour-js/next` are now wide static ranges (`>=0.6.0`); the same-version releases of the fixed group are the actual compatibility contract.
