---
"paramour": minor
---

Add an opt-in `trailingSlash` route option. A route defined with `defineAppRoute(path, { trailingSlash: true, … })` (or `definePagesRoute`) builds every non-root path with a trailing slash, from `href` and `buildPath` alike: `/asset/?type=skill`, `/docs/a/b/`, and `/docs/` for an elided optional catch-all, while the root stays `/`. It matches a Next app with `trailingSlash: true` in `next.config`, such as a static export, and needs no Next runtime, so core-only code (a CLI printing absolute links) builds the same URLs. The default and wire-format rule R6 are otherwise unchanged; the path literal and the `Href` brand stay slash-free, and `describeRoute` reports `trailingSlash: true` for opted-in routes.
