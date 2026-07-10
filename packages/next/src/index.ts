export { RouteCollisionError } from "./collisions.js";
export { type ParamourConfig } from "./config.js";
export {
  emitArtifact,
  type EmitRoutes,
  writeIfChanged,
  type WriteIfChangedResult,
} from "./emit.js";
export { type AcquireLockResult, acquireWatcherLock } from "./lock.js";
export { DEFAULT_PAGE_EXTENSIONS, scanAppRoutes } from "./scan-app.js";
export { scanPagesRoutes } from "./scan-pages.js";
export {
  resolveRouteDirs,
  type RouteDirs,
  scanRoutes,
  type ScanRoutesResult,
} from "./scan.js";
export {
  DEFAULT_DEBOUNCE_MS,
  type RouteDirsWatcher,
  watchRouteDirs,
  type WatchRouteDirsOptions,
} from "./watch.js";
export {
  withTypedRoutes,
  type WithTypedRoutesOptions,
} from "./with-typed-routes.js";
