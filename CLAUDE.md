# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Paramour — a type-safe routing companion for the Next.js App Router (validated route/search params, typed path building, explicit URL serialization) using Standard Schema for bring-your-own-validator support. It is pre-release: `packages/core` holds the real implementation; `packages/next`, `packages/codemod`, `examples/*`, and `docs/` are placeholders.

## Commands

pnpm monorepo (pnpm 11, Node >= 24.18). Run from the repo root:

- `pnpm test` — runtime tests (vitest, matches `packages/*/test/**/*.test.ts`)
- `pnpm test packages/core/test/codecs.test.ts` — single test file; add `-t "name"` to filter by test name
- `pnpm test:types` — type tests (tstyche, matches `packages/core/**/*.tst.*`); pass a path fragment to filter, e.g. `pnpm test:types codec-api`
- `pnpm typecheck` — `tsc --noEmit` in every package
- `pnpm lint` — ESLint (type-checked rules; slow-ish)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm changeset` — add a changeset (changesets is the release mechanism)

CI runs, in order: `format:check`, `lint`, `typecheck`, `test`, `test:types`. All five must pass.

## Two kinds of tests

- `*.test.ts` (vitest) — runtime behavior. `conformance.test.ts` exercises the wire-format spec's numbered rules.
- `*.tst.ts` (tstyche) — compile-time API contracts, including _intentional type errors_. These files are deliberately excluded from ESLint and from the package tsconfig; they are checked only by tstyche via `packages/core/tsconfig.tstyche.json` (same compiler options, exclusion removed). Don't "fix" type errors in them and don't add them to the tsc project.

## Design docs and decision IDs

Design/spike/review docs live in `.claude/docs/` (gitignored — internal docs never go in the public repo): `DESIGN.md` (overall architecture), `design-02-codec-api.md` (codec API decisions), `wire-format-spec.md` (URL wire format). Code comments cite decision IDs from these docs — `D3`, `S6`, `P6`, `§4`, etc. When touching behavior near such a comment, read the cited section first; when adding behavior that implements a spec rule, cite the ID the same way.

## Core architecture (`packages/core/src`)

- `codec.ts` — the `Codec<Out, P, C, A>` interface and `createCodec`. Codecs are bidirectional wire converters (parse + serialize), which is the whole reason the library exists: Standard Schema is validate-only, so serialization must be library-owned. The `P` (presence), `C` (caught), `A` (arity) type parameters are type-state: modifier methods (`.optional()`, `.default()`, `.catch()`) become `never` after use or on illegal combinations, so invalid chains fail to compile rather than being checked at runtime. Runtime-internal properties are prefixed `~` and are not public API; `~out` is a phantom property carrying the output type.
- `p.ts` — the `p.*` codec builders (`string`, `integer`, `number`, `boolean`, `enum`, `isoDate`, `timestamp`, `json`, …). Parsing uses strict anchored regexes per the wire-format spec, not `Number()` coercion.
- `search.ts` — search-param encode/decode between codec configs and `URLSearchParams`/Next's `searchParams` object, plus `buildSearchString`, which hand-rolls byte-layer encoding (deliberately not `URLSearchParams#toString`: spaces are `%20`, not `+`).
- `errors.ts` — `ParamourError` hierarchy with brand-based `instanceof` hardening; `rebrandForeign`/`foreignMessage` wrap errors thrown by user-supplied Standard Schema validators.
- `index.ts` — the package barrel. Tests import from the barrel, not deep paths; new public API must be re-exported here.

## Conventions that will bite if missed

- ESM throughout; relative imports use `.js` extensions (`from "./codec.js"`), `verbatimModuleSyntax` is on so type-only imports must use `import type`.
- Strictest TS: `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are enabled — type-level code here is written against those settings.
- ESLint uses `strictTypeChecked` + `stylisticTypeChecked` + perfectionist `recommended-natural`: object keys, imports, union members, etc. must be alphabetically sorted or lint fails.
- Route definitions in the eventual API are "route objects as currency" (imported objects, not string-keyed registries); keep tree-shaking perfect — no central runtime registry.
