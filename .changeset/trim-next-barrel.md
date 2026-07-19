---
"@paramour-js/next": minor
---

Remove the codegen toolchain from the public barrel (`emitArtifact`, `writeIfChanged`, `acquireWatcherLock`, `scanRoutes`, `scanAppRoutes`, `scanPagesRoutes`, `resolveRouteDirs`, `watchRouteDirs`, `DEFAULT_DEBOUNCE_MS`, `DEFAULT_PAGE_EXTENSIONS`, and their companion types). These were build-internal plumbing for `withTypedRoutes` and the `paramour` CLI, not app-author API. The public surface is now `withTypedRoutes`, `WithTypedRoutesOptions`, `ParamourConfig`, and `RouteCollisionError`.
