---
"@paramour-js/next": patch
---

`paramour doctor` no longer tells you to remove a correct `trailingSlash: true` from a route definition when it misreads `next.config`. The static reader used to treat two config shapes as `trailingSlash: false`: a plugin call that takes options before the config (`withPlugin(options, config)`), and a config object changed after its declaration (`config.trailingSlash = true` under an `if`, `Object.assign(config, …)`, `delete`, a reassignment, or `module.exports` assigned more than once). It now treats both as unknown and skips the trailing slash check, as it already does for a config function. Single-argument wrappers such as `withTypedRoutes(config)` and curried `withPlugin(options)(config)` are still read.
