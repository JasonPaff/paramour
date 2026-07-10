# examples/type-errors

The negative suite: a real (never-built) hybrid Next project that MUST FAIL
`tsc --noEmit` with exactly the diagnostics annotated in `cases/`.

Why it exists beyond the tstyche suites: these errors are produced **as a
consumer** — through the packages' built dist `.d.ts` plus a committed,
CLI-generated `paramour-env.d.ts` in a real Next tsconfig (post-generation
"world B") — a different compilation reality than `packages/core/test/` or
`packages/core/test-registry/`, which check library sources or paths-mapped
tstyche programs.

## How it works

- Everything outside `cases/` is a small but genuine hybrid app (an `app/`
  tree, one `pages/` route) that must compile **green** — it registers the
  routes the broken code plays against and proves the harness's
  unexpected-diagnostic check has teeth.
- `cases/*.ts` — one file per category:
  - `registry.ts` — world-B rejections that exist only because of the
    generated registry (unregistered paths, near-misses, cross-router paths)
  - `codec-chains.ts` — illegal codec modifier chains (type-state `never`)
  - `route-params.ts` — param-key exactness
  - `href.ts` — `href()` contract violations
  - `router-surface.ts` — app/pages parse-surface gating
  - `hooks.ts` — hooks rejecting the wrong router's routes
- Marker syntax — a full-line comment annotating the **next** code line:

  ```ts
  // @expect-error TS2349 — .optional() may only be applied once
  p.string().optional().optional();
  ```

- `scripts/check.mjs` runs `tsc --noEmit --pretty false` and requires an
  exact bidirectional match between markers and diagnostics (per
  file:line:code): a missing diagnostic is a type-level regression, an
  unexpected one is a break in the clean skeleton. Either fails.
- `paramour generate --check` runs first as the codegen drift gate.

## Running

```sh
pnpm build            # from the repo root, once (dist types + the CLI bin)
pnpm check:type-errors
```

## Adding a case

1. Write the erroring expression in the matching `cases/` file with a
   provisional marker (any TS code) directly above the line you expect to
   error.
2. Run the harness — the `UNEXPECTED`/`MISSING` report prints the actual
   code and line; transcribe them into the marker.
3. `pnpm format`, then re-run the harness — prettier can move an erroring
   token to a different line, which shifts where the marker must sit.

## Deliberate differences from the other examples

- **No `build` or `typecheck` scripts** — the root recursive
  `pnpm build`/`pnpm typecheck` must not sweep in a project that fails tsc
  by design. The only entry point is `check`.
- **Hand-committed `next-env.d.ts`** without the `.next/types` import — no
  `next build` ever runs, so no build output exists to import.
- **No `incremental`** in tsconfig — the harness needs deterministic full
  diagnostics on every run.
