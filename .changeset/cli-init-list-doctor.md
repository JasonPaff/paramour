---
"@paramour-js/next": minor
"paramour": minor
---

The CLI grows from a single command into a subcommand suite, and core gains a reflection surface to power it.

**`paramour` (core):** new `describeCodec`/`describeRoute` reflection API (with `CodecDescription`, `RouteDescription`, `ParamDescription`, `SearchDescription`, `CodecDefaultDescription` types). Codecs now carry `~kind` and `~enumMembers` runtime metadata: every `p.*` builder records which builder made it, `p.enum` records its members, and `p.custom` accepts an optional `label` used as the reflected kind. Descriptions cover arity, presence, caught state, enum members, and defaults (value-form defaults include their wire serialization; factory defaults are marked without being invoked).

**`@paramour-js/next` (CLI):** `paramour generate` keeps its exact flags and behavior, now routed through a subcommand dispatcher alongside four new commands (exit-code contract unchanged: 0 success, 1 verification failed, 2 usage/config/operational):

- `paramour init` — non-interactive setup: scaffolds `paramour.config.ts`, wraps `next.config.(ts|mjs|js)` with `withTypedRoutes` via a real AST codemod (magicast; idempotent, wraps outside existing wrappers, falls back to printing the exact snippet for shapes it can't transform safely — including CJS `module.exports`), adds a `"paramour": "paramour generate"` package script, runs the first generate, and prints a detect-and-verify summary. Flags: `--dry-run`, `--force`, `--no-config`, `--no-wrap`, `--no-script`, `--no-generate`.
- `paramour list` — prints every filesystem route (the scan stays authoritative) overlaid with its params/search shape read from `defineAppRoute`/`definePagesRoute` call sites: source files are content-scanned for the constructors and matching modules are evaluated via jiti, degrading per-module on load failures. Reports filesystem-only routes, orphan definitions, and duplicates; `--json` for machine-readable output. New optional `routeFiles` config globs pin the definition scan when the heuristic misfires.
- `paramour doctor` — standalone diagnostics: config validity, route-dir discovery, artifact freshness, next.config wrap state, paramour/@paramour-js/next version alignment, tsconfig artifact coverage, and definition-discovery health. Warnings exit 0, failures exit 1; `--json` supported.
- `paramour check` — first-class alias of `generate --check` (rejects `--watch`).
