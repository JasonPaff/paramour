---
"@paramour-js/next": patch
---

Hardening fixes surfaced by the new test suite. `acquireWatcherLock` throwing (e.g. a directory sitting at the pidfile path) no longer escapes uncaught: `paramour generate --watch` maps it to the documented exit 2 instead of crashing the bin with an unhandled rejection, and `withTypedRoutes`' dev phase warns once and continues in stale-types mode instead of taking down `next dev` (§7.3). Config validation now rejects `pageExtensions` entries with a leading dot (they silently matched nothing) in both the config file and the `--page-extensions` flag, and a JSON config with invalid syntax now names the file in its error message.
