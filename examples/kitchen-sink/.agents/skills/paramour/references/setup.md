# Setup: adding paramour to a project (greenfield)

## 1. Install both packages

```sh
npm install paramour @paramour-js/next
# or
pnpm add paramour @paramour-js/next
# or
yarn add paramour @paramour-js/next
```

Requirements: `next >= 15`, `react >= 18.2`, Node `>= 22.13` for the CLI. ESM-only packages.

## 2. Run `npx paramour init`

`init` is non-interactive and idempotent: it runs straight through with defaults and prints one status line per step. Steps:

1. Scaffold `paramour.config.ts` at the project root (all fields commented-out defaults — deleting the file changes nothing). Skipped if any `paramour.config.{ts,mjs,json}` already exists; `--force` overwrites/replaces it.
2. Wrap `next.config.*` with `withTypedRoutes` via an AST transform. If no next.config exists or the transform cannot apply safely, it prints a manual snippet to apply yourself — that is still a SUCCESS outcome (exit 0), not a failure.
3. Add `"paramour": "paramour generate"` to `package.json` scripts.
4. Run the first generate (skipped with a warning if no `app/` or `pages/` directory exists yet).
5. Install the paramour agent skill files into detected agent tool directories (`.claude/`, `.cursor/`, etc.); skip with `--no-skills`.
6. Append a marker-delimited (`<!-- paramour:start -->` … `<!-- paramour:end -->`) paramour section to an existing `AGENTS.md` (or, failing that, `CLAUDE.md`) pointing agents at the installed skill and the verify loop. Never creates the file; re-runs refresh the section in place; skip with `--no-agents-md`.

Then a `setup:` detect-and-verify summary (route dirs found, both packages declared, tsconfig `include` covers the artifact) — these are warn-level and never change the exit code — and a final reminder to commit the artifact.

Output marks to recognize:

- `✔ created paramour.config.ts` / `✔ wrapped next.config.ts with withTypedRoutes` / `✔ added "paramour" script to package.json` / `✔ wrote paramour-env.d.ts (N routes)` — step performed.
- `• ... already exists — skipped` / `• ... already wraps withTypedRoutes — skipped` / `• ... already up to date — skipped` — idempotent skip; fine.
- `→ could not transform ... — apply this yourself:` followed by an indented snippet — apply the printed snippet manually, then continue; exit is still 0.
- `⚠ no route directory yet — skipped generate` — create `app/` or `pages/`, then run `paramour generate`.

Flags: `--dry-run` (report every step, write nothing), `--force` (overwrite an existing paramour.config), `--no-config`, `--no-generate`, `--no-script`, `--no-wrap`, `--no-skills`, `--no-agents-md`, `--help`/`-h`.

## 3. Manual equivalent (when init cannot be used)

Scaffold `paramour.config.ts` (optional — only needed to override discovery; every value shown is the default):

```ts
import type { ParamourConfig } from "@paramour-js/next";

export default {
  // appDir: "app",
  // outFile: "paramour-env.d.ts",
  // pageExtensions: ["tsx", "ts", "jsx", "js"],
  // pagesDir: "pages",
  // routeFiles: ["src/routes/**/*.ts"], // pin `paramour list`'s definition scan
} satisfies ParamourConfig;
```

Wrap next.config:

```ts
import { withTypedRoutes } from "@paramour-js/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default withTypedRoutes(nextConfig);
```

`withTypedRoutes(config, options?)` regenerates the artifact once per production build (drift warns; `{ strict: true }` fails the build on drift instead) and runs a debounced regeneration watcher during `next dev`. `{ outFile: "..." }` relocates the artifact (monorepo escape hatch). Generation is never load-bearing: a missing route dir or an incidental failure warns and continues with stale types — the two exceptions that throw are an app↔pages route collision and a populated-but-ignored route dir.

Add the script to `package.json`:

```json
{ "scripts": { "paramour": "paramour generate" } }
```

## 4. Define a first route

Colocate a route definition next to its page (any module works; `route.def.ts` beside `page.tsx` is the common pattern):

```ts
// app/product/[id]/route.def.ts
import { defineAppRoute, p } from "paramour";

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
  },
});
```

Use it in the page. Annotate props with paramour's `RouteProps` (Next's promised `params`/`searchParams` are structurally assignable to it):

```tsx
// app/product/[id]/page.tsx
import type { RouteProps } from "paramour";
import { productRoute } from "./route.def";

export default async function ProductPage(props: RouteProps) {
  // Throws ParamsDecodeError/SearchDecodeError on a malformed URL — pair
  // with an error.tsx boundary, or use safeParse for a status-discriminated
  // result instead of a throw.
  const { params, search } = await productRoute.parse(props);
  return (
    <h1>
      Product #{params.id} (page {search.page})
    </h1>
  );
}
```

Build links to it from anywhere:

```ts
import { href } from "paramour";
import { productRoute } from "@/app/product/[id]/route.def";

const link = href(productRoute, { params: { id: 42 }, search: { q: "hi" } });
// "/product/42?q=hi" — page=1 elides because it equals the default
```

## 5. Generate, verify, commit

```sh
npx paramour generate   # writes paramour-env.d.ts
npx paramour check      # exit 0 = artifact current
```

Commit `paramour-env.d.ts` with the route change. The artifact is a pure `.d.ts` module augmentation (`declare module "paramour" { interface ParamourRegister { ... } }`) that turns `defineAppRoute`/`definePagesRoute` path literals and `href("/static/path")` strings into filesystem-verified unions. Ensure the project tsconfig `include` covers it (Next's default `**/*.ts` include does).

## Exit codes (all CLI commands)

- `0` — success, including init's printed manual-fallback snippets and idempotent skips.
- `1` — ONLY "the thing you asked me to verify is not true": `check` (or `generate --check`) drift or missing artifact, `doctor` with a failing check, `skills --check` with missing/stale skill files.
- `2` — usage/config/operational errors: unknown command or flag, invalid `paramour.config` (unknown key, dotted `pageExtensions` entry), no `package.json` for init, no route directory for generate, app↔pages route collisions.

## Common failure modes

- `paramour check` exit 1 saying `out of date` or `is missing`, with a route diff: run `paramour generate` and commit. If it says `content differs from generator output` with no route diff, someone hand-edited the artifact — regenerate, never edit.
- Route collision (same path served by both `app/` and `pages/`): exit 2 from the CLI and a thrown error from `withTypedRoutes` — remove one of the duplicates; Next itself cannot build that state either.
- `no route directory` from `paramour generate`: run from the project root (the directory holding `app/`/`pages/` or `src/app/`/`src/pages/`), or set `appDir`/`pagesDir` in `paramour.config.ts`.
- Registered-path types not narrowing (any string accepted in `defineAppRoute`): the artifact is missing or not covered by tsconfig `include` — run `paramour doctor`.
