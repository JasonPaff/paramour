# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Paramour — a type-safe routing companion for the Next.js App Router (validated route/search params, typed path building, explicit URL serialization) using Standard Schema for bring-your-own-validator support. It is pre-release: `packages/core` holds the routing library; `packages/next` holds the Next.js integration (`withTypedRoutes`, hooks, and the `paramour` CLI: `generate`/`check`/`init`/`list`/`doctor`); `packages/nuqs` holds `@paramour-js/nuqs`, a thin adapter deriving nuqs parsers from a route's search codecs (design-10, `NQ*`); `packages/devtools` holds `@paramour-js/devtools`, a TanStack Devtools panel fed by an observation seam in the next-package hooks (design-12, `DT*` — seam contract of record: `packages/next/src/devtools-seam.ts`, published types-only as `@paramour-js/next/devtools-seam`); `packages/codemod` and `docs/` are placeholders.

## Commands

pnpm monorepo (pnpm 11, Node >= 24.18). Run from the repo root:

- `pnpm test` — runtime tests (vitest, matches `packages/*/test/**/*.test.ts`)
- `pnpm test packages/core/test/codecs.test.ts` — single test file; add `-t "name"` to filter by test name
- `pnpm test:types` — type tests (tstyche, matches `packages/core/test/**/*.tst.*`); pass a path fragment to filter, e.g. `pnpm test:types codec-api`
- `pnpm test:types:devtools` — type tests for `packages/devtools` (`packages/devtools/test/**/*.tst.*`, own tstyche/tsconfig pair)
- `pnpm test:types:next` — type tests for `packages/next` (`packages/next/test/**/*.tst.*`, own tstyche/tsconfig pair)
- `pnpm test:types:nuqs` — type tests for `packages/nuqs` (same pattern: own tstyche/tsconfig pair)
- `pnpm test:types:registry` — world-B type tests (`packages/core/test-registry/`, its own tstyche/tsconfig pair): post-generation registry behavior via a hand-authored `declare module "paramour"` augmentation. A separate compilation unit on purpose — module augmentation is program-global, so these files must never move into `test/`
- `pnpm typecheck` — `tsc --noEmit` in every package; includes `examples/basic`, which needs the packages built first
- `pnpm build` — topological: core tsc → next tsc (dist + the `paramour` CLI bin) → devtools tsc → `examples/basic` `next build`. `pnpm build:packages` skips the example for fast package-only builds. `test/cli-dist.test.ts`, `test:types:registry`, and `packages/devtools` (whose seam types resolve from next's dist) need a build to have run
- `pnpm lint:fix` — ESLint with auto-fix (type-checked rules; slow-ish)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm changeset` — add a changeset (changesets is the release mechanism)

CI runs, in order: `format:check`, `build`, `lint`, `typecheck`, `test`, `test:types`, `test:types:devtools`, `test:types:next`, `test:types:nuqs`, `test:types:registry`. All ten must pass (`build` precedes `lint` and `typecheck` so the type-checked sources and the example resolve the packages' dist types).

## Two kinds of tests

- `*.test.ts` (vitest) — runtime behavior. `conformance.test.ts` exercises the wire-format spec's numbered rules.
- `*.tst.ts` (tstyche) — compile-time API contracts, including _intentional type errors_. These files are deliberately excluded from ESLint and from the package tsconfig; they are checked only by tstyche via the owning package's `tsconfig.tstyche.json` (same compiler options, exclusion removed). Don't "fix" type errors in them and don't add them to the tsc project.

## Design docs and decision IDs

Design/spike/review docs live in `.claude/docs/` (gitignored — internal docs never go in the public repo), currently `design-07` through `design-11` plus analysis docs (`competitor-feature-comparison.md`, `examples-gaps.md`, `proposal-dx-improvements.md`). Each design doc has a decision-ID prefix (design-10 → `NQ*`, design-11 → `CV*`). The early numbered rules (`D*` codec API, `S*`/`P*`/`SS*` wire format, `RL*` route layer) come from retired docs (`DESIGN.md`, `design-02-codec-api.md`, `design-04`, `wire-format-spec.md`, …) and now live only in the code comments that cite them — the comment at the citation site is the authoritative statement of the rule. When touching behavior near such a comment, read it (and its neighbors citing the same ID) first; when adding behavior that implements a documented decision, cite its ID the same way.

## Core architecture (`packages/core/src`)

- `codec.ts` — the `Codec<Out, P, C, A, E>` interface and `createCodec`. Codecs are bidirectional wire converters (parse + serialize), which is the whole reason the library exists: Standard Schema is validate-only, so serialization must be library-owned. The `P` (presence), `C` (caught), `A` (arity), `E` (default-elides — value vs factory `.default()`, NQ6a) type parameters are type-state: modifier methods (`.optional()`, `.default()`, `.catch()`) become `never` after use or on illegal combinations, so invalid chains fail to compile rather than being checked at runtime. Runtime-internal properties are prefixed `~` and are not public API; `~out` is a phantom property carrying the output type.
- `p.ts` — the `p.*` codec builders (`string`, `integer`, `number`, `boolean`, `enum`, `isoDate`, `timestamp`, `json`, `csv`, …). Parsing uses strict anchored regexes per the wire-format spec, not `Number()` coercion.
- `search.ts` — search-param encode/decode between codec configs and `URLSearchParams`/Next's `searchParams` object, plus `buildSearchString`, which hand-rolls byte-layer encoding (deliberately not `URLSearchParams#toString`: spaces are `%20`, not `+`).
- `describe.ts` — `describeCodec`/`describeRoute`, the public reflection surface over the `~`-prefixed runtime metadata (`~kind`, `~enumMembers`, presence/default/catch state); powers `paramour list`/`doctor` in `packages/next`.
- `errors.ts` — `ParamourError` hierarchy with brand-based `instanceof` hardening; `rebrandForeign`/`foreignMessage` wrap errors thrown by user-supplied Standard Schema validators.
- `index.ts` — the package barrel. Tests import from the barrel, not deep paths; new public API must be re-exported here.

## Conventions that will bite if missed

- ESM throughout; relative imports use `.js` extensions (`from "./codec.js"`), `verbatimModuleSyntax` is on so type-only imports must use `import type`.
- Strictest TS: `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are enabled — type-level code here is written against those settings.
- ESLint uses `strictTypeChecked` + `stylisticTypeChecked` + perfectionist `recommended-natural`: object keys, imports, union members, etc. must be alphabetically sorted or lint fails.
- Route definitions in the eventual API are "route objects as currency" (imported objects, not string-keyed registries); keep tree-shaking perfect — no central runtime registry.
