import { readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { resolveInputs } from "../cli-inputs.js";
import { message } from "../cli-io.js";
import { loadConfigFile, type ParamourConfig } from "../config.js";
import {
  checkArtifact,
  formatRouteDiff,
  type GenerateInputs,
} from "../generate.js";
import { tsconfigCheck } from "../init/scaffold.js";
import {
  detectWrapState,
  findNextConfig,
  readTrailingSlash,
} from "../init/wrap-next-config.js";
import {
  discoverRouteDefinitions,
  type RouteDefinition,
  routeKey,
} from "../list/discover-route-defs.js";
import { scanRoutes, type ScanRoutesResult } from "../scan.js";
import { skillsDoctorChecks } from "../skills/doctor.js";

/**
 * One `paramour doctor` finding. `fail` means a verification the user cares
 * about is untrue (exit 1, same class as check-drift); `warn` is advisory
 * and never affects the exit code.
 */
export interface DoctorCheck {
  detail?: string[];
  label: string;
  status: "fail" | "pass" | "warn";
}

/**
 * @internal The check battery, in report order. Each check degrades
 * independently — doctor exists to diagnose broken setups, so a throwing
 * probe becomes a finding, never a crash.
 */
export async function runDoctorChecks(
  projectRoot: string,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  // 1. Config file parses and validates.
  let config: ParamourConfig = {};
  try {
    const loaded = await loadConfigFile(projectRoot);
    config = loaded?.config ?? {};
    checks.push({
      label:
        loaded === undefined
          ? "config: no paramour.config file — defaults in effect"
          : `config: ${basename(loaded.path)} is valid`,
      status: "pass",
    });
  } catch (error) {
    checks.push({
      detail: [message(error)],
      label: "config: invalid",
      status: "fail",
    });
  }

  // 2. Route directories resolve (joint discovery, config dirs honored).
  let inputs: GenerateInputs | undefined;
  try {
    inputs = await resolveInputs({}, projectRoot, config);
    const dirs = [inputs.appDir, inputs.pagesDir]
      .filter((dir): dir is string => dir !== undefined)
      .map((dir) => `${relative(projectRoot, dir).replaceAll("\\", "/")}/`);
    checks.push({
      label: `route directories: ${dirs.join(", ")}`,
      status: "pass",
    });
  } catch (error) {
    checks.push({
      detail: [message(error)],
      label: "route directories: not found",
      status: "fail",
    });
  }

  // 3. Artifact exists and is current (the `check` engine).
  let routes: ScanRoutesResult | undefined;
  if (inputs === undefined) {
    checks.push({
      label: "artifact: skipped (no route directories)",
      status: "warn",
    });
  } else {
    const artifactRel = relative(projectRoot, inputs.artifactPath).replaceAll(
      "\\",
      "/",
    );
    try {
      routes = scanRoutes(inputs, inputs.pageExtensions);
      const result = checkArtifact(inputs);
      if (result.upToDate) {
        checks.push({
          label: `artifact: ${artifactRel} is up to date`,
          status: "pass",
        });
      } else {
        checks.push({
          detail: [
            ...formatRouteDiff(result.app, result.pages),
            "run `paramour generate` and commit the result",
          ],
          label: result.missingFile
            ? `artifact: ${artifactRel} is missing`
            : `artifact: ${artifactRel} is out of date`,
          status: "fail",
        });
      }
    } catch (error) {
      checks.push({
        detail: [message(error)],
        label: "artifact: check failed",
        status: "fail",
      });
    }
  }

  // 4. next.config wraps withTypedRoutes — warn-level: CLI-only workflows
  // (generate in a package script, check in CI) are legitimate.
  const nextConfig = findNextConfig(projectRoot);
  if (nextConfig === undefined) {
    checks.push({
      detail: ["`paramour init` can create and wrap one"],
      label: "next.config: none found",
      status: "warn",
    });
  } else {
    const name = basename(nextConfig.path);
    try {
      const state = await detectWrapState(
        readFileSync(nextConfig.path, "utf8"),
      );
      if (state === "wrapped") {
        checks.push({
          label: `next.config: ${name} wraps withTypedRoutes`,
          status: "pass",
        });
      } else {
        checks.push({
          detail: [
            state === "unparseable"
              ? "could not parse it to verify"
              : "dev/build auto-regeneration is off; `paramour init` can wrap it (CLI-only workflows are fine)",
          ],
          label: `next.config: ${name} does not wrap withTypedRoutes`,
          status: "warn",
        });
      }
    } catch (error) {
      checks.push({
        detail: [message(error)],
        label: `next.config: could not read ${name}`,
        status: "warn",
      });
    }
  }

  // 5. Version alignment between the two packages.
  checks.push(versionCheck(projectRoot));

  // 6. Installed agent skills reflect this package's bundled content —
  // upgrade-adjacent like the version check, hence its neighbor.
  checks.push(...skillsDoctorChecks(projectRoot));

  // 7. tsconfig covers the artifact (init's warn-level heuristic).
  // resolve, not join — an absolute outFile must win, as it does in
  // resolveInputs.
  const artifactPath =
    inputs?.artifactPath ??
    resolve(projectRoot, config.outFile ?? "paramour-env.d.ts");
  const coverage = tsconfigCheck(projectRoot, artifactPath);
  checks.push({
    ...(coverage.detail === undefined ? {} : { detail: [coverage.detail] }),
    label: `tsconfig: ${coverage.label}`,
    status: coverage.ok ? "pass" : "warn",
  });

  // 8. Route-definition discovery health (list's engine).
  const discovered = await discoveryCheck(projectRoot, config, routes);
  checks.push(discovered.check);

  // 9. Route definitions build the URLs next.config serves. Reported only
  // when there is an answer: definitions exist and the config's
  // trailingSlash reads statically.
  if (nextConfig !== undefined && discovered.definitions.length > 0) {
    const check = await trailingSlashCheck(
      nextConfig.path,
      discovered.definitions,
    );
    if (check !== undefined) checks.push(check);
  }

  return checks;
}

async function discoveryCheck(
  projectRoot: string,
  config: ParamourConfig,
  routes: ScanRoutesResult | undefined,
): Promise<{ check: DoctorCheck; definitions: RouteDefinition[] }> {
  try {
    const discovery = await discoverRouteDefinitions(projectRoot, {
      routeFiles: config.routeFiles,
    });
    const files = new Set(
      discovery.definitions.map((definition) => definition.file),
    );
    const detail: string[] = [];
    if (routes !== undefined) {
      const defined = new Set(
        discovery.definitions.map((definition) =>
          routeKey(definition.route["~router"], definition.route.path),
        ),
      );
      const all = [
        ...routes.appRoutes.map((path) => routeKey("app", path)),
        ...routes.pagesRoutes.map((path) => routeKey("pages", path)),
      ];
      const covered = all.filter((key) => defined.has(key)).length;
      detail.push(
        `${String(covered)} of ${String(all.length)} filesystem routes have definitions`,
      );
    }
    for (const failure of discovery.loadFailures) {
      detail.push(`failed to load ${failure.file}: ${failure.message}`);
    }
    for (const duplicate of discovery.duplicates) {
      detail.push(
        `duplicate definition of ${duplicate.path} (${duplicate.router}) in ${duplicate.file} — ${duplicate.firstFile} wins`,
      );
    }
    return {
      check: {
        detail,
        label: `route definitions: ${String(discovery.definitions.length)} found in ${String(files.size)} module${files.size === 1 ? "" : "s"}`,
        status:
          discovery.loadFailures.length > 0 || discovery.duplicates.length > 0
            ? "warn"
            : "pass",
      },
      definitions: discovery.definitions,
    };
  } catch (error) {
    return {
      check: {
        detail: [message(error)],
        label: "route definitions: discovery failed",
        status: "warn",
      },
      definitions: [],
    };
  }
}

function readManifest(
  projectRoot: string,
  name: string,
): undefined | { version?: unknown } {
  // Walks upward like Node resolution: workspaces hoist dependencies to a
  // parent node_modules, so a single project-root read hard-fails healthy
  // monorepo setups.
  for (let dir = projectRoot; ; dir = dirname(dir)) {
    try {
      return JSON.parse(
        readFileSync(
          join(dir, "node_modules", ...name.split("/"), "package.json"),
          "utf8",
        ),
      ) as { version?: unknown };
    } catch {
      if (dirname(dir) === dir) return undefined;
    }
  }
}

/**
 * Warn-level: a route whose `trailingSlash` disagrees with next.config's
 * builds a URL the app only reaches through a redirect (or, in a static
 * export, a path with no file behind it). `undefined` when the config's value
 * cannot be read statically — no finding beats a guessed one.
 */
async function trailingSlashCheck(
  nextConfigPath: string,
  definitions: readonly RouteDefinition[],
): Promise<DoctorCheck | undefined> {
  let configured: boolean | undefined;
  try {
    configured = await readTrailingSlash(readFileSync(nextConfigPath, "utf8"));
  } catch {
    return undefined;
  }
  if (configured === undefined) return undefined;
  const name = basename(nextConfigPath);
  const setting = `trailingSlash: ${String(configured)}`;
  // The routes come from the app's own paramour, which may predate the
  // option and lack the member: missing reads as the R6 default.
  const mismatched = definitions.filter(
    (definition) =>
      ((definition.route["~trailingSlash"] as boolean | undefined) ?? false) !==
      configured,
  );
  if (mismatched.length === 0) {
    return {
      label: `trailing slash: route definitions match ${name} (${setting})`,
      status: "pass",
    };
  }
  const fix = configured
    ? "add trailingSlash: true to its definition"
    : "remove trailingSlash: true from its definition";
  return {
    detail: mismatched.map(
      (definition) =>
        `${definition.route.path} (${definition.route["~router"]}) in ${definition.file}: ${fix}`,
    ),
    label: `trailing slash: ${String(mismatched.length)} route definition${mismatched.length === 1 ? "" : "s"} disagree${mismatched.length === 1 ? "s" : ""} with ${name} (${setting})`,
    status: "warn",
  };
}

function versionCheck(projectRoot: string): DoctorCheck {
  const coreManifest = readManifest(projectRoot, "paramour");
  const nextManifest = readManifest(projectRoot, "@paramour-js/next");
  const core =
    typeof coreManifest?.version === "string"
      ? coreManifest.version
      : undefined;
  const next =
    typeof nextManifest?.version === "string"
      ? nextManifest.version
      : undefined;
  const missing = [
    ...(next === undefined ? ["@paramour-js/next"] : []),
    ...(core === undefined ? ["paramour"] : []),
  ];
  if (missing.length > 0 || core === undefined || next === undefined) {
    return {
      detail: ["install dependencies and re-run"],
      label: `versions: ${missing.join(", ")} not resolvable in node_modules`,
      status: "fail",
    };
  }
  // The paramour packages release in LOCKSTEP (one changesets fixed group),
  // and @paramour-js/next peers on the app's own `paramour` — so a coherent
  // install has the two at the same version. The peer range itself is the
  // package manager's to enforce; lockstep equality is the stronger claim,
  // and the one that catches a half-upgraded app.
  if (core !== next) {
    return {
      detail: [
        "paramour packages release together — upgrade them to the same version (e.g. `pnpm up paramour @paramour-js/next`)",
      ],
      label: `versions: paramour ${core} != @paramour-js/next ${next}`,
      status: "warn",
    };
  }
  return {
    label: `versions: paramour and @paramour-js/next are both ${core}`,
    status: "pass",
  };
}
