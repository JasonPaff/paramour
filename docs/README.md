# docs

The Paramour documentation site — a Fumadocs app on the Next.js App Router,
deployed to Vercel (`paramour.dev`).

The site is a workspace package that consumes `paramour` and
`@paramour-js/next` via `workspace:*`, so it builds after the packages in the
topological `pnpm build` and fails CI when a code change breaks its snippets
or routes. `pnpm build:packages` deliberately excludes it — that script
exists for fast package-only builds.

The site dogfoods paramour: every site-authored route is defined as a
paramour route object (see `app/**/route.def.ts`), `paramour check` gates the
build (see `scripts.build`), and `withTypedRoutes(..., { strict: true })`
backstops `next build` itself. The generated `paramour-env.d.ts` is committed.

Docs code blocks use Twoslash: every TypeScript snippet compiles against the
workspace packages during the build, so snippet rot is a CI failure. Snippets
import from package names (`paramour`, `@paramour-js/next`), never relative
paths.

- `pnpm --filter docs dev` — local dev server
- `pnpm --filter docs build` — `paramour check` + production build
- `pnpm --filter docs run paramour` — regenerate `paramour-env.d.ts`
