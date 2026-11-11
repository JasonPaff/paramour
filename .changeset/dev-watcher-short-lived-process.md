---
"@paramour-js/next": patch
---

The `withTypedRoutes` dev watcher no longer keeps a process alive. Next also loads `next.config` in short-lived processes, such as the telemetry flush it starts when `next dev` stops. That process waited for the watcher forever and kept the watcher lock, so every later `next dev` logged `paramour: watcher already running (pid N)` and did not regenerate route types when routes changed. The flush process now exits normally and releases the lock. Also, when `next dev` finds the lock held by another live process, it now takes over the watcher as soon as that process exits, instead of running without a watcher for the whole session.
