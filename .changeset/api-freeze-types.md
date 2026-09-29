---
"paramour": minor
"@paramour-js/next": minor
"@paramour-js/nuqs": patch
"@paramour-js/devtools-panel": patch
---

**Breaking — 1.0 API freeze, part 1: types and naming.** These changes settle the public type surface before 1.0.

- **`InferRouteSearch<R>`** (new) is the route-level twin of `InferRouteParams<R>`. Hook signatures, `standardSearchSchema` (`StandardSearchSchema<R>` now takes the route) and the docs use it, so no public signature mentions a route's internal `~search` member anymore. The `~`-prefixed members are documented as outside semver.
- **Search type helpers renamed.** `InferSearchInput` / `InferSearchOutput` now accept any `search:` slot (a codec map or `rawSearch`). `SearchOutputOf` is removed; use `InferSearchOutput`. `OutputOf` is renamed to `InferCodecOutput`. `RoutePropsInput` / `ParamsPropsInput` / `SearchPropsInput` are renamed to `RoutePropsLike` / `ParamsPropsLike` / `SearchPropsLike`.
- **`RouteConfig` and `SearchSlot` are exported**, so generic wrappers around `defineAppRoute` / `definePagesRoute` can be written.
- **Search functions take a route or a config.** `decodeSearch`, `safeDecodeSearch`, `encodeSearch` and `searchToString` accept either one. `decodeSearch`'s `routePath` third argument is removed; pass the route instead, and its path anchors the error.
- **`SafeResult<T, E>`** gains an error parameter. Params-only surfaces (`safeParseParams`, `safeDecodeParams`, `useRouteParams`) are typed `SafeResult<T, ParamsDecodeError>`, and search-only surfaces use `SearchDecodeError`. `RouterResult<T, E>` follows. Every error class now has a literal `name` (for example `"SearchDecodeError"`) that survives minification. This also makes the two decode errors structurally distinct.
- **`AnyCodec<Out>`** can be narrowed to one output type. Only `Codec`'s first type parameter is public API; the type-state parameters after it may change in minor releases.
- **`p.custom` can no longer impersonate built-ins.** Its `kind` is always `"custom"`, and its `label` is reported separately as `CodecDescription.label`. `kind` is now a `CodecKind` union.
- **`parseValue`** moves from `paramour/internal` to the main entry point, alongside `serializeValue`. `paramour/internal` is now covered by semver within a major.
- `ParseError`'s `selfDescribing` flag and constructor option are now internal.
