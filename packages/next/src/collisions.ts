/**
 * Route-collision failure mode (PR9): states Next itself refuses to build
 * have no valid artifact, so the scanners throw instead of emitting one.
 * Composition points map this error to their ruled exits — CLI exit 2,
 * `withTypedRoutes` throw during config evaluation, and a non-fatal loud
 * log under watch (the TR5 exception: a collision mid-`--watch` is usually
 * a file mid-move, so the last good artifact stays on disk).
 */
export class RouteCollisionError extends Error {
  override name = "RouteCollisionError";
}
