import type { AnyRoute } from "paramour";

/**
 * Structural view of a route's define-time segment tokens (`~segments`) —
 * derived from the route type rather than importing core's non-barrel
 * `PathSegment`, so this stays pinned to what a live route actually carries.
 */
export type RouteSegments = AnyRoute["~segments"];

/**
 * Does `pathname` (from `window.location`) match this route's pattern?
 * Powers DT10's "current URL" grouping: static segments compare against the
 * percent-DECODED path part; `single` consumes exactly one part; `catchall`
 * one-plus; `optional-catchall` zero-plus (both are terminal by Next's
 * grammar, mirrored by core's tokenizer). Trailing slashes are
 * normalization noise (`/shop/` matches `/shop`).
 */
export function matchesPathname(
  segments: RouteSegments,
  pathname: string,
): boolean {
  const parts = pathname.split("/").filter((part) => part !== "");
  let index = 0;
  for (const segment of segments) {
    switch (segment.kind) {
      case "catchall": {
        if (parts.length - index < 1) return false;
        index = parts.length;
        break;
      }
      case "optional-catchall": {
        index = parts.length;
        break;
      }
      case "single": {
        if (parts[index] === undefined) return false;
        index += 1;
        break;
      }
      case "static": {
        const part = parts[index];
        if (part === undefined || decodePart(part) !== segment.raw)
          return false;
        index += 1;
        break;
      }
    }
  }
  return index === parts.length;
}

/** A malformed escape in a URL the panel merely OBSERVES must not throw. */
function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
