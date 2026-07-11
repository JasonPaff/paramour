import { describeRoute, type RouterKind } from "paramour";

import { parseCommandFlags } from "../cli-args.js";
import { resolveInputs } from "../cli-inputs.js";
import { type CliIo, message, resolveIo } from "../cli-io.js";
import { loadConfigFile } from "../config.js";
import {
  discoverRouteDefinitions,
  routeKey,
} from "../list/discover-route-defs.js";
import {
  buildListJson,
  type DescribedDefinition,
  type ListedRoute,
  type ListReport,
  renderListReport,
} from "../list/render.js";
import { scanRoutes } from "../scan.js";

const USAGE = [
  "Usage: paramour list [options]",
  "",
  "Print every filesystem route with its params/search shape.",
  "",
  "Shapes come from defineAppRoute/definePagesRoute call sites: list scans",
  "source files for those calls and EVALUATES the matching modules to read",
  "their route objects (set `routeFiles` globs in paramour.config to pin",
  "which modules). Modules that fail to load are reported and skipped.",
  "",
  "Options:",
  "  --app-dir <dir>           app directory (default: discovered app/ or src/app/)",
  "  --help, -h                show this help",
  "  --json                    machine-readable output",
  "  --page-extensions <list>  comma-separated, no leading dots (default: tsx,ts,jsx,js)",
  "  --pages-dir <dir>         pages directory (default: discovered pages/ or src/pages/)",
].join("\n");

/**
 * @internal `paramour list`: the filesystem scan is authoritative for WHICH
 * routes exist (same engine as generate); discovered definitions overlay
 * the shapes. A filesystem route with no definition and a definition with
 * no filesystem route are both warnings, not errors — the report doubles
 * as a coverage check, and warnings exit 0.
 */
export async function runList(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  const { stderr, stdout } = resolveIo(io);
  const parsed = parseCommandFlags(
    argv,
    {
      "app-dir": { type: "string" },
      help: { default: false, short: "h", type: "boolean" },
      json: { default: false, type: "boolean" },
      "page-extensions": { type: "string" },
      "pages-dir": { type: "string" },
    },
    USAGE,
    { stderr, stdout },
  );
  if ("exit" in parsed) return parsed.exit;
  const flags = parsed.values;

  const projectRoot = process.cwd();
  let report: ListReport;
  try {
    const config = (await loadConfigFile(projectRoot))?.config ?? {};
    const inputs = await resolveInputs(flags, projectRoot, config);
    const routes = scanRoutes(inputs, inputs.pageExtensions);
    const discovery = await discoverRouteDefinitions(projectRoot, {
      routeFiles: config.routeFiles,
    });

    const described = new Map<string, DescribedDefinition>();
    for (const definition of discovery.definitions) {
      described.set(
        routeKey(definition.route["~router"], definition.route.path),
        {
          description: describeRoute(definition.route),
          exportName: definition.exportName,
          file: definition.file,
        },
      );
    }
    const matched = new Set<string>();
    const overlay = (router: RouterKind, paths: string[]): ListedRoute[] =>
      paths.map((path) => {
        const key = routeKey(router, path);
        const definition = described.get(key) ?? null;
        if (definition !== null) matched.add(key);
        return { definition, path };
      });
    const appRoutes = overlay("app", routes.appRoutes);
    const pagesRoutes = overlay("pages", routes.pagesRoutes);
    const orphans = [...described.entries()]
      .filter(([key]) => !matched.has(key))
      .map(([, definition]) => definition);
    report = {
      appRoutes,
      duplicates: discovery.duplicates,
      loadFailures: discovery.loadFailures,
      orphans,
      pagesRoutes,
    };
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }

  if (flags.json) {
    stdout(JSON.stringify(buildListJson(report), null, 2));
    return 0;
  }
  for (const line of renderListReport(report)) stdout(line);
  return 0;
}
