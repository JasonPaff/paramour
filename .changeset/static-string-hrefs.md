---
"paramour": minor
---

`href` now accepts a registered static path string as an alternative to a route object: `href("/about")`, `href("/about", { hash: "team" })`. Defining a route for a static path purely to link to it safely is no longer necessary — the generated registry already verifies the path against the filesystem, and the string form returns the same branded `Href<"/about">` a route object would.

- The static-path union is **derived** from the existing per-router registry unions (a path containing `[` is dynamic) — no change to the generated `paramour-env.d.ts` format; already-generated artifacts gain the feature for free. New exported types: `RegisteredStaticAppRoutePaths`, `RegisteredStaticPagesRoutePaths`, and the router-agnostic `RegisteredStaticRoutePaths` the string overload consumes (its permissive `string` fallback applies only when NEITHER router has generated routes, so single-router projects keep full verification).
- The string form's options are **hash-only** (`StaticHrefOptions`, also exported): `params`/`search` are banned at the type level. A static path that needs query params still warrants `defineAppRoute` with search codecs — typed serialization remains the only road to a query string.
- Pre-generation, any string is accepted (the same documented unverified fallback the route constructors carry). A runtime guard backstops it: a path that doesn't start with `/` or contains `[`, `]`, `?`, or `#` throws `ParamourError`, as does a JS caller passing a `params`/`search` half.
- Optional catch-all routes (`/docs/[[...slug]]`) are not in the static union even though `/docs` is a reachable URL — they carry a codec, so linking them stays route-object work (`href(docsRoute)` already builds `/docs` bare).
- Known diagnostics change: a failing route-object `href` call now reports TS2769 ("No overload matches this call") with the specific diagnosis in the last-overload detail, instead of a direct single-overload error.
