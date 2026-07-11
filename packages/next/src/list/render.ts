import type {
  CodecDescription,
  ParamDescription,
  RouteDescription,
} from "paramour";

import type {
  DuplicateDefinition,
  LoadFailure,
} from "./discover-route-defs.js";

/** A discovered definition with its reflection attached. */
export interface DescribedDefinition {
  description: RouteDescription;
  exportName: string;
  file: string;
}

/** One filesystem route, with its definition overlay when one was found. */
export interface ListedRoute {
  definition: DescribedDefinition | null;
  path: string;
}

/** Everything `paramour list` renders, human or `--json`. */
export interface ListReport {
  appRoutes: ListedRoute[];
  duplicates: DuplicateDefinition[];
  loadFailures: LoadFailure[];
  /** Definitions whose `(router, path)` matched no filesystem route. */
  orphans: DescribedDefinition[];
  pagesRoutes: ListedRoute[];
}

/**
 * `--json` payload. Keys are alphabetical; a route with no definition
 * carries `definition: null` rather than an absent member — friendlier to
 * both `jq` and exactOptionalPropertyTypes consumers.
 */
export function buildListJson(report: ListReport): unknown {
  return {
    appRoutes: report.appRoutes.map(routeJson),
    duplicates: report.duplicates,
    loadFailures: report.loadFailures,
    orphanDefinitions: report.orphans.map(definitionJson),
    pagesRoutes: report.pagesRoutes.map(routeJson),
  };
}

/**
 * `integer`, `enum(a, b)`, `string[]`, with annotations in fixed order:
 * presence, default, catch.
 */
export function formatCodec(description: CodecDescription): string {
  let base =
    description.enumMembers === undefined
      ? description.kind
      : `enum(${description.enumMembers.join(", ")})`;
  if (description.arity === "many") base += "[]";
  const notes: string[] = [];
  if (description.presence === "optional") notes.push("(optional)");
  if (description.defaultValue !== undefined) {
    notes.push(
      description.defaultValue.kind === "value"
        ? `(default: ${description.defaultValue.wire})`
        : "(default: factory)",
    );
  }
  if (description.caught) notes.push("(catch)");
  return [base, ...notes].join(" ");
}

/** Human report; one string per output line. */
export function renderListReport(report: ListReport): string[] {
  const lines = [
    ...renderGroup("app", report.appRoutes),
    ...renderGroup("pages", report.pagesRoutes),
  ];
  if (lines.length === 0) lines.push("no routes found");
  if (report.orphans.length > 0) {
    lines.push("", "definitions with no filesystem route:");
    for (const orphan of report.orphans) {
      lines.push(
        `  ⚠ ${orphan.description.path} (${orphan.description.router})  ${orphan.file}`,
      );
    }
  }
  if (report.duplicates.length > 0) {
    lines.push("", "duplicate definitions (first wins):");
    for (const duplicate of report.duplicates) {
      lines.push(
        `  ⚠ ${duplicate.path} (${duplicate.router})  ${duplicate.file} (already defined in ${duplicate.firstFile})`,
      );
    }
  }
  if (report.loadFailures.length > 0) {
    lines.push(
      "",
      `${String(report.loadFailures.length)} module${report.loadFailures.length === 1 ? "" : "s"} failed to load (definitions in them are not shown):`,
    );
    for (const failure of report.loadFailures) {
      lines.push(`  ⚠ ${failure.file}: ${failure.message}`);
    }
  }
  return lines;
}

function definitionJson(definition: DescribedDefinition): unknown {
  return {
    exportName: definition.exportName,
    file: definition.file,
    params: definition.description.params,
    path: definition.description.path,
    router: definition.description.router,
    search: definition.description.search,
  };
}

/**
 * A param's codec is per-element (D5/D6) — the array-ness comes from the
 * segment kind, so catch-all params render with the `[]` suffix plus a
 * segment note.
 */
function formatParam(param: ParamDescription): string {
  if (param.segmentKind === "single") return formatCodec(param);
  const note =
    param.segmentKind === "catchall" ? "(catch-all)" : "(optional catch-all)";
  return `${formatCodec({ ...param, arity: "many" })} ${note}`;
}

function renderGroup(router: "app" | "pages", routes: ListedRoute[]): string[] {
  if (routes.length === 0) return [];
  const lines = [`${router} routes (${String(routes.length)}):`];
  const width = Math.max(...routes.map((route) => route.path.length));
  for (const route of routes) {
    const annotation =
      route.definition === null
        ? "⚠ filesystem only (no route definition found)"
        : route.definition.file;
    lines.push(`  ${route.path.padEnd(width)}  ${annotation}`);
    if (route.definition !== null) {
      lines.push(...renderShape(route.definition.description));
    }
  }
  lines.push("");
  return lines;
}

function renderKeys(
  keys: Readonly<Record<string, string>>,
  indent: string,
): string[] {
  const names = Object.keys(keys);
  const width = Math.max(...names.map((name) => name.length)) + 1;
  return names.map(
    (name) => `${indent}${`${name}:`.padEnd(width)} ${keys[name] ?? ""}`,
  );
}

function renderShape(description: RouteDescription): string[] {
  const lines: string[] = [];
  const params = Object.entries(description.params);
  if (params.length > 0) {
    lines.push("    params:");
    lines.push(
      ...renderKeys(
        Object.fromEntries(
          params.map(([name, param]) => [name, formatParam(param)]),
        ),
        "      ",
      ),
    );
  }
  if (description.search.kind === "raw") {
    lines.push("    search: (rawSearch schema)");
  } else if (description.search.kind === "codecs") {
    lines.push("    search:");
    lines.push(
      ...renderKeys(
        Object.fromEntries(
          Object.entries(description.search.keys).map(([name, codec]) => [
            name,
            formatCodec(codec),
          ]),
        ),
        "      ",
      ),
    );
  }
  return lines;
}

function routeJson(route: ListedRoute): unknown {
  return {
    definition:
      route.definition === null ? null : definitionJson(route.definition),
    path: route.path,
  };
}
