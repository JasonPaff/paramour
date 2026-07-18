import type { CodecDescription, RouterKind } from "paramour";

import { formatCodecDescription } from "paramour";

/**
 * Pure presentation helpers (design-12 DT7/DT9/DT17): codec shapes, wire
 * and parsed value rendering, and the `href()` reproduction snippet.
 */

/**
 * One-line shape label from a `CodecDescription` (DT7), e.g.
 * `enum(asc|desc)? =asc catch` — core's shared walk in its compact skin,
 * so the panel and `paramour list` can never drift on the field set.
 */
export function formatShape(description: CodecDescription): string {
  return formatCodecDescription(description, "compact");
}

/**
 * Wire column rendering (DT7): absence is `—`; present values are
 * JSON-quoted so whitespace and emptiness are visible, repeated keys
 * comma-joined in wire order.
 */
export function formatWire(
  values: readonly string[] | string | undefined,
): string {
  if (values === undefined) return "—";
  if (typeof values === "string") return JSON.stringify(values);
  if (values.length === 0) return "—";
  return values.map((value) => JSON.stringify(value)).join(", ");
}

/**
 * A JS source literal for a decoded value (DT9): `Date` prints as
 * `new Date("<iso>")` so the snippet round-trips through `href`, arrays and
 * plain objects recurse, identifier-safe keys go unquoted.
 */
export function jsLiteral(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((element) => jsLiteral(element)).join(", ")}]`;
  }
  switch (typeof value) {
    case "bigint":
      return `${String(value)}n`;
    case "boolean":
    case "number":
      return String(value);
    case "object": {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const body = entries
        .map(([key, entry]) => `${literalKey(key)}: ${jsLiteral(entry)}`)
        .join(", ");
      return `{ ${body} }`;
    }
    case "string":
      return JSON.stringify(value);
    default:
      // function / symbol: not representable as a value literal.
      return `[${typeof value}]`;
  }
}

/**
 * The `href(route, { params, search })` reproduction snippet (DT9): the
 * user's route identifier is unknowable, so a path-derived placeholder name
 * carries the true pattern in a trailing comment. Empty halves are omitted.
 * The snippet doubles as documentation of the API the user should be
 * writing.
 */
export function reproSnippet(
  path: string,
  router: RouterKind,
  params: Readonly<Record<string, unknown>> | undefined,
  search: Readonly<Record<string, unknown>> | undefined,
): string {
  const name = `${routeVariableName(path)} /* ${path} (${router} router) */`;
  const lines: string[] = [];
  if (params !== undefined && Object.keys(params).length > 0) {
    lines.push(`  params: ${jsLiteral(params)},`);
  }
  if (search !== undefined && Object.keys(search).length > 0) {
    lines.push(`  search: ${jsLiteral(search)},`);
  }
  if (lines.length === 0) return `href(${name})`;
  return `href(${name}, {\n${lines.join("\n")}\n})`;
}

/**
 * `/shop/[slug]` → `shopSlugRoute`; `/` → `route`. Brackets and catch-all
 * dots strip to the bare name; segments camelCase-join.
 */
export function routeVariableName(path: string): string {
  const words = path
    .split("/")
    .map((segment) => segment.replaceAll(/[[\].]/g, ""))
    .filter((segment) => segment !== "")
    .flatMap((segment) => segment.split(/[^a-zA-Z0-9]+/))
    .filter((word) => word !== "");
  if (words.length === 0) return "route";
  const camel = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
  return `${camel}Route`;
}

const IDENTIFIER = /^[$A-Z_a-z][\w$]*$/;

function literalKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}
