---
"@paramour-js/next": minor
---

Typed-routes dev machinery (design-05 block 2): the TR5 debounced watcher (`watchAppDir`) and the TR6 cross-process pidfile lock (`acquireWatcherLock`). The watcher is native recursive `fs.watch` where any event collapses into debounce → full rescan, with the artifact path and `node_modules`/`.next` subtrees ignored and all failures surfaced non-fatally via `onError`. The lock is deliberately best-effort: liveness-probe the recorded PID, decline against a live owner, take over a stale one, and clean up on exit/SIGINT/SIGTERM with signal re-raise.
