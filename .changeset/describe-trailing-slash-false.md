---
"paramour": patch
---

`describeRoute` reports `trailingSlash` whenever the route's config sets it, `false` included, so an explicit opt-out is distinguishable from an unset option. `RouteDescription.trailingSlash` is now typed `boolean`.
