/** A scanned route path labeled with the router that produced it (PR9). */
export interface ScannedRoute {
  path: string;
  router: "app" | "pages";
}

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

/**
 * `[[...name]]` → optional catch-all; used for the specificity check below.
 */
const OPTIONAL_CATCH_ALL = /^\[\[\.\.\..+\]\]$/;

/**
 * Classifies a path segment: `plain` for `[id]`, `catchAll` for `[...slug]`
 * AND `[[...slug]]` (one family — mixing required and optional at one level
 * is itself a Next error), `undefined` for a literal segment. Alternatives
 * ordered most-wrapped first so `[[...x]]` is never misread as a `[name]`
 * whose name is `[...x]`.
 */
const DYNAMIC_SEGMENT =
  /^(?:\[\[\.\.\.(?<optional>.+)\]\]|\[\.\.\.(?<catchAll>.+)\]|\[(?<plain>[^[\]]+)\])$/;

/**
 * PR9's structural collisions — same detection pass, non-equal strings. Two
 * states Next also refuses to build that plain string equality misses:
 *
 * - **Different slug names at one level**: `/x/[id]` + `/x/[slug]` — Next:
 *   "You cannot use different slug names for the same dynamic path". Within
 *   one parent, at one segment position, at most one dynamic segment of each
 *   KIND may exist — across both scanners, and cross-router for a shared
 *   prefix, which is why the entries carry router labels. Kinds are compared
 *   separately because `[id]` beside `[...slug]` is Next's documented
 *   priority pattern (predefined > dynamic > catch-all), not an error; but
 *   `[...a]` beside `[[...a]]` IS one ("optional and required catch-all at
 *   the same level"), so the catch-all family compares whole segments.
 * - **Optional-catch-all specificity**: `/docs` + `/docs/[[...slug]]` — an
 *   optional catch-all also matches its own base path, so the pair collides
 *   at `/docs` even though the strings differ.
 *
 * Callers: each scanner over its own output, then the orchestrator over the
 * merged, labeled union (cross-router pairs only surface there).
 */
export function assertNoStructuralCollisions(
  routes: readonly ScannedRoute[],
): void {
  // parent-prefix + position + kind → the first dynamic segment seen there.
  const dynamicAt = new Map<string, ScannedRoute & { segment: string }>();
  const byPath = new Map<string, ScannedRoute>();
  for (const route of routes) byPath.set(route.path, route);

  for (const route of routes) {
    const segments = route.path === "/" ? [] : route.path.slice(1).split("/");
    for (const [index, segment] of segments.entries()) {
      const kind = dynamicKind(segment);
      if (kind === undefined) continue;
      const key = `${segments.slice(0, index).join("/")}#${String(index)}#${kind}`;
      const existing = dynamicAt.get(key);
      if (existing !== undefined && existing.segment !== segment) {
        throw new RouteCollisionError(
          `route collision: "${existing.path}" (${existing.router}) and "${route.path}" (${route.router}) declare conflicting dynamic segments (${existing.segment} vs ${segment}) at the same position — Next refuses different slug names for the same dynamic path (PR9)`,
        );
      }
      if (existing === undefined) {
        dynamicAt.set(key, { ...route, segment });
      }
    }

    const last = segments.at(-1);
    if (last !== undefined && OPTIONAL_CATCH_ALL.test(last)) {
      const base =
        segments.length === 1 ? "/" : `/${segments.slice(0, -1).join("/")}`;
      const baseRoute = byPath.get(base);
      if (baseRoute !== undefined) {
        throw new RouteCollisionError(
          `route collision: "${route.path}" (${route.router}) also matches "${base}" (${baseRoute.router}) — an optional catch-all has the same specificity as its base path, which Next refuses to build (PR9)`,
        );
      }
    }
  }
}

function dynamicKind(segment: string): "catchAll" | "plain" | undefined {
  const groups = DYNAMIC_SEGMENT.exec(segment)?.groups;
  if (groups === undefined) return undefined;
  return groups.plain === undefined ? "catchAll" : "plain";
}
