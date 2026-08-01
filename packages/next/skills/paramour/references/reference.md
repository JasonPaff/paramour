# Reference: exports, CLI, config, wire format

## `paramour` barrel exports

Runtime values:

| Export                                                                                               | Purpose                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `p`                                                                                                  | Codec builders: `string, integer, number, boolean, enum, isoDate, timestamp, json, csv, array, index, custom`   |
| `defineAppRoute(path, config)`                                                                       | Define an App Router route object (`config: { params?, search? }`)                                              |
| `definePagesRoute(path, config)`                                                                     | Define a Pages Router route object                                                                              |
| `href(routeOrStaticPath, options?)`                                                                  | Build a typed link (`{ params?, search?, hash? }`); returns `Href` (string subtype)                             |
| `buildPath(route, params)`                                                                           | Path portion only (`/a/b`), no query                                                                            |
| `encodeParams(route, params)`                                                                        | Encoded path segments as `string[]`                                                                             |
| `encodeStaticParams(route, params)`                                                                  | Per-param wire-string record for `generateStaticParams` / `getStaticPaths`                                      |
| `decodeParams(route, source, opts?)`                                                                 | Sync params decode; throws `ParamsDecodeError`; `opts: { percentDecode?: boolean }` (default true — App Router) |
| `decodeSearch(config, source, routePath?)`                                                           | Sync search decode; throws `SearchDecodeError`; unknown keys ignored                                            |
| `safeDecodeParams` / `safeDecodeSearch`                                                              | `SafeResult`-returning twins of the two decoders                                                                |
| `encodeSearch(config, input)`                                                                        | Decoded values → ordered wire pairs `[string, string][]` (default elision applied)                              |
| `buildSearchString(pairs)`                                                                           | Pairs → `?…` string (`%20`, never `+`)                                                                          |
| `searchToString(config, input)`                                                                      | `encodeSearch` + `buildSearchString`                                                                            |
| `serializeValue(codec, label, value)`                                                                | One value through a codec's serializer, string contract enforced                                                |
| `rawSearch(schema)` / `isRawSearch(config)`                                                          | Whole-object search escape hatch and its discriminant                                                           |
| `standardSearchSchema(route)`                                                                        | Export a route's search config as a Standard Schema (tRPC input, TanStack `validateSearch`)                     |
| `describeCodec(codec)` / `describeRoute(route)` / `formatCodecDescription(desc, style)`              | Reflection over codec/route metadata (powers `paramour list`)                                                   |
| `ParamourError, ParseError, SerializeError, ParamsDecodeError, SearchDecodeError, SearchSourceError` | Error classes (brand-hardened `instanceof`)                                                                     |

Key types: `Codec`, `AnyCodec`, `OutputOf`, `ParamCodec`, `Presence`, `PresenceOf`, `Arity`; `AppRoute`, `PagesRoute`, `Route`, `AnyRoute`, `AnyAppRoute`, `AnyPagesRoute`, `RouterKind`, `PagesContext`; `RouteProps`, `ParamsProps`, `SearchProps` (+ `*Input` sync-accepting forms) — annotate page/layout props with these; `InferRouteParams`, `SearchOutputOf`, `InferSearchInput`, `InferSearchOutput`, `InferStaticParams`, `InferHrefInput`, `HrefArgs`, `Href`, `StaticHrefOptions`; `SafeResult`, `RouteDecodeError`, `Issue`, `IssueReason`; `ParamsConfig`, `SearchConfig`, `ParamsSource`, `SearchSource`, `RawSearch`, `StandardSearchSchema`; `ParamourRegister` + `Registered*RoutePaths` (codegen augmentation targets); `CodecDescription`, `RouteDescription`, `ParamDescription`, `SearchDescription`, `CodecDefaultDescription`, `CodecFormatStyle`; `DecodeParamsOptions`.

## `@paramour-js/next` exports

| Entry point                       | Exports                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@paramour-js/next`               | `withTypedRoutes(config, options?)` (`options: { outFile?, strict? }`), `RouteCollisionError`, types `WithTypedRoutesOptions`, `ParamourConfig`                             |
| `@paramour-js/next/app`           | `useRouteParams`, `useRouteParamsOrThrow`, `useSearch`, `useSearchOrThrow` (all `(route, options?)` with `options: { select, equality?: "shallow" }`), type `SelectOptions` |
| `@paramour-js/next/pages`         | `useRouteParams`, `useSearch` (return `RouterResult` = `SafeResult` + `{ status: "pending" }`), types `RouterResult`, `SelectOptions`                                       |
| `@paramour-js/next/testing`       | `ParamourTestingProvider`, `withParamourTesting(options?)`, type `ParamourTestingOptions` (`isReady, mounted, onReplace, params, pathname, search`)                         |
| `@paramour-js/next/devtools-seam` | Types-only seam contract consumed by `@paramour-js/devtools`; not needed in app code                                                                                        |

## CLI (`paramour <command>`, bin shipped by `@paramour-js/next`)

Exit-code contract for every command: `0` success; `1` ONLY a failed verification (`check` drift, `doctor` fail, `skills --check` missing/stale); `2` usage/config/operational errors.

| Command    | Purpose                                                                                              | Flags                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate` | Write `paramour-env.d.ts` from route dirs                                                            | `--app-dir <dir>`, `--pages-dir <dir>`, `--out-file <file>`, `--page-extensions <list>`, `--check`, `--watch`                                                                                                      |
| `check`    | Verify the artifact is current; exit 1 on drift or missing; never writes                             | `--app-dir`, `--pages-dir`, `--out-file`, `--page-extensions`                                                                                                                                                      |
| `init`     | Set up paramour: scaffold config, wrap next.config, add script, first generate, install agent skills | `--dry-run`, `--force`, `--no-config`, `--no-generate`, `--no-script`, `--no-wrap`, `--no-skills`                                                                                                                  |
| `list`     | Print every filesystem route with its params/search shape (evaluates route-definition modules)       | `--json`, `--app-dir`, `--pages-dir`, `--page-extensions`                                                                                                                                                          |
| `doctor`   | Diagnose setup: config validity, artifact freshness, next.config wrapping, versions, tsconfig        | `--json`; exit 1 on any failing check, warnings exit 0                                                                                                                                                             |
| `skills`   | Install/sync this agent skill into detected tool dirs (`.claude/`, `.cursor/`, …)                    | `--check` (verify only; exit 1 on missing/stale), `--dry-run`, `--force` (overwrite user-edited files), `--json`, `--tool <t>` (agents, claude, codex, cursor; repeatable or comma-separated, overrides detection) |

All commands accept `--help`/`-h` and run against `process.cwd()` as the project root.

## `paramour.config.{ts,mjs,json}` (project root; first match wins; all fields optional)

Precedence: CLI flags → config file → discovery. Unknown keys are rejected (exit 2).

| Field            | Default                     | Meaning                                                                                                |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `appDir`         | discovered `app/`/`src/app` | App directory, relative to project root                                                                |
| `pagesDir`       | discovered `pages/`…        | Pages directory                                                                                        |
| `outFile`        | `paramour-env.d.ts`         | Artifact path (monorepo escape hatch); also settable on `withTypedRoutes`                              |
| `pageExtensions` | `["tsx","ts","jsx","js"]`   | No leading dots                                                                                        |
| `routeFiles`     | automatic content scan      | Globs of modules exporting route definitions — used by `list`/`doctor` only; generation never reads it |

`.ts`/`.mjs` files default-export the object (`export default {...} satisfies ParamourConfig`).

## Wire-format summary (numbered spec: docs/reference/wire-format on paramour.dev)

| Family | Scope                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S      | Byte layer: `%20` never `+` (S2); absence = omitted key, `""` = `key=` (S3); never bare `?flag` (S4); deterministic declaration order (S5); hash only from `href`'s explicit option, verbatim (S10)                                                                                                                                                                                          |
| P      | Parse layer: duplicate values on a scalar codec are an error, catchable (P5); absent array key → `[]` (P6); unknown keys ignored and never validated (P8)                                                                                                                                                                                                                                    |
| SS     | `rawSearch`: explicit wrapper only; schema sees every key on decode; encode is a raw pass-through, schema never runs; no elision/round-trip                                                                                                                                                                                                                                                  |
| D      | Codec grammar: `.catch()` recovers parse failures never absence (D2); presence governs absence and every declared key appears in decode output (D4); params take no presence modifiers (D5); a catch-all codec describes one element (D6); value defaults elide (D8)                                                                                                                         |
| CV     | `p.csv`: one comma-joined wire value; `""` ↔ `[]`; empty elements are parse failures; serialize rejects elements that are empty or contain commas                                                                                                                                                                                                                                            |
| R      | Route segments: one segment per `[param]` (R1); catch-all elements encode independently, inner `/` → `%2F` (R2); optional catch-all elides, required `[]` is a `SerializeError` (R3); empty segment value is a `SerializeError` (R4); App Router param props arrive percent-ENCODED and core decodes them — Pages surfaces opt out via `percentDecode: false` (R5); no trailing slashes (R6) |
| PP     | `p.array` typed elements by composition (PP1); `p.index` is 1-based on the wire, 0-based in memory (PP5)                                                                                                                                                                                                                                                                                     |

Facts agents trip on:

- Booleans serialize as exactly `true`/`false`; anything else fails to parse.
- Dates: `p.isoDate` is `YYYY-MM-DD`; `p.timestamp` is full ISO UTC (`Z` only, offsets rejected); both reject impossible calendar dates.
- Integers reject `1e3`, hex, whitespace, and unsafe-range values.
- Arrays: `p.array` repeats the key (`?t=a&t=b`); `p.csv` packs one key (`?t=a,b`). Same in-memory `string[]`, two deliberate wire spellings — do not swap them casually.
- Value-form `.default()` elides: building a URL with the default value emits nothing for that key; decoding the bare URL restores the default. Factory defaults never elide.
- An href with no emitted pairs has no `?` at all; a fully elided optional catch-all leaves the bare base path (`/docs`, never `/docs/`).
