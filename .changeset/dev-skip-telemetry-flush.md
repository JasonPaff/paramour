---
"@paramour-js/next": patch
---

`withTypedRoutes` no longer generates routes or starts the dev watcher in Next's telemetry flush, the process `next dev` starts when it stops. The flush loads `next.config` in the dev phase only to read `distDir`. paramour used to regenerate `paramour-env.d.ts` there and take the watcher lock. A `next dev` started while the flush was still running logged `paramour: watcher already running (pid N); taking over when it exits`.
