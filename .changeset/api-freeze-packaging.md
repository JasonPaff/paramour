---
"@paramour-js/next": minor
"@paramour-js/nuqs": minor
"@paramour-js/devtools-panel": minor
---

**Breaking — 1.0 API freeze, part 2: packaging and wiring.**

- **`paramour` is now a peer dependency** of `@paramour-js/next`, `@paramour-js/nuqs` and `@paramour-js/devtools-panel`. Previously next and nuqs had an exact-pinned regular dependency, which could give an app two copies of core. That broke `ParamourRegister` augmentation and the `Href` brand. Install `paramour` alongside them; the setup docs already say to.
- **`withTypedRoutes` reads `paramour.config.*`**, the same file the CLI reads. `appDir`, `pagesDir` and `outFile` now apply to `next dev`/`next build` too, so the wrapper and `paramour generate` always write the same artifact. The `outFile` option is removed from `WithTypedRoutesOptions`, which is now just `{ strict? }`; set `outFile` in the config file instead. Next's own `pageExtensions` still decides what counts as a page inside Next. The wrapper warns once if the config file lists different extensions, and a malformed config file throws during config evaluation.
- **`@paramour-js/next/devtools-seam` declares only types**, so a value import through the types-only entry can no longer type-check. The seam contract is covered by semver. `ParamourObservationBase` is exported. `ParamourHookId` and the observation kinds are documented as open unions, so consumers should keep a default branch.
- **`RouteCollisionError` extends `ParamourError`**, with a cross-copy `instanceof` brand and a literal `name`.
- **`paramour doctor`** now checks that `paramour` and `@paramour-js/next` have the same version, since the packages release in lockstep.
