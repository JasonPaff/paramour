---
name: paramour
description: Type-safe routing for Next.js using the paramour and @paramour-js/next packages. Covers defining routes as route objects (defineAppRoute, definePagesRoute), typing params and searchParams with p.* codecs and the .optional()/.default()/.catch() modifiers, building typed links with href(), reading route state with typed hooks (useSearch, useRouteParams) and server parse surfaces (route.parse), wrapping next.config with withTypedRoutes, and using the paramour CLI (generate, check, init, list, doctor, skills). Load when working in a Next.js project that depends on paramour, when setting paramour up, or when migrating raw params/searchParams usage in an App Router or Pages Router project to validated, typed route objects.
---

# paramour

Paramour is a type-safe routing companion for Next.js: each route is defined once as an importable route object whose params and search params are described by bidirectional wire codecs (parse AND serialize — Standard Schema validators plug in for validation, serialization is library-owned). Two packages: `paramour` (validation-agnostic core: `p.*` codec builders, `defineAppRoute`/`definePagesRoute`, `href`, decode/encode helpers) and `@paramour-js/next` (Next integration: `withTypedRoutes` config wrapper, App/Pages Router hooks, the `paramour` CLI).

## Core rules (always apply)

1. Import only from package barrels: `paramour`, `@paramour-js/next`, `@paramour-js/next/app`, `@paramour-js/next/pages`, `@paramour-js/next/testing`. Never import `dist/` or deep source paths.
2. Codec modifier legality is type-state: illegal chains do not compile (the method's type becomes `never`) and throw at runtime for JS callers. The rules:
   - `.optional()` and `.default()` apply only to a bare, unmodified single-value codec — at most ONE of the two, at most once. `.optional().default()`, `.default().optional()`, and any repeat are illegal.
   - `.catch()` applies at most once and combines with either presence modifier in either order. It recovers parse failures of PRESENT wire values only — never absence.
   - `p.array(...)` codecs take no `.optional()`/`.default()` (an absent key and `[]` are the same wire state). `.catch()` is allowed.
   - Codecs in a `params:` config take no presence modifiers at all (`.optional()`/`.default()` are illegal there); `.catch()` is allowed.
   - `p.csv(element)`/`p.array(element)` elements must be bare unmodified scalars: no modifiers, no csv inside csv, no array-arity element.
   - `.default(value)` rejects values whose type includes a function; a function argument is always a factory (`.default(() => value)`).
3. `paramour-env.d.ts` is a generated artifact. NEVER hand-edit it. Regenerate with `paramour generate` (dev server and builds wrapped by `withTypedRoutes` also regenerate it) and commit the result.
4. After adding, renaming, moving, or deleting any route file or `defineAppRoute`/`definePagesRoute` call, run `paramour check`. Exit 1 means drift — run `paramour generate`, then commit the artifact with the route change.
5. When converting an existing project, migrate ONE route per pass — define, wire, verify, commit — never a big-bang rewrite. See `references/migration.md`.
6. Route objects are the currency: export them from a module and import them where needed. Never build a central string-keyed route registry.

## Verification loop

- `paramour list` — print every filesystem route with its params/search shape as the library sees it (`--json` for machine output). Warnings (route without a definition, definition without a route) exit 0.
- `paramour generate` — (re)write `paramour-env.d.ts` from `app/` / `pages/`.
- `paramour check` — verify the artifact is current. Exit 1 on drift or a missing artifact; never writes.
- `paramour doctor` — diagnose setup (config validity, artifact freshness, next.config wrapping, version alignment, installed agent skills, tsconfig coverage). Exit 1 on any failing check; warnings exit 0.

Also run the project's type check (`tsc --noEmit` or the build) after route changes — paramour's guarantees are compiler-enforced, so a wrong codec chain or a misspelled param surfaces there.

## Task router

Read exactly the reference file matching the task; each is self-contained.

| Task                                                                                  | Read                      |
| ------------------------------------------------------------------------------------- | ------------------------- |
| Install paramour into a project that does not have it yet (init, config, first route) | `references/setup.md`     |
| Convert existing raw `params`/`searchParams` code to paramour routes                  | `references/migration.md` |
| Day-to-day work: write codecs, define routes, build links, use hooks                  | `references/authoring.md` |
| Look up an export, hook, CLI flag, config option, or wire-format rule                 | `references/reference.md` |
