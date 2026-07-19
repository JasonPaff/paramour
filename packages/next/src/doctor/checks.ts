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
import { detectWrapState, findNextConfig } from "../init/wrap-next-config.js";
import {
  discoverRouteDefinitions,
  routeKey,
} from "../list/discover-route-defs.js";
import { scanRoutes, type ScanRoutesResult } from "../scan.js";

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

  // 2. Route directories resolve (PR8 discovery, config dirs honored).
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

  // 6. tsconfig covers the artifact (init's warn-level heuristic).
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

  // 7. Route-definition discovery health (list's engine).
  checks.push(await discoveryCheck(projectRoot, config, routes));

  return checks;
}

async function discoveryCheck(
  projectRoot: string,
  config: ParamourConfig,
  routes: ScanRoutesResult | undefined,
): Promise<DoctorCheck> {
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
      detail,
      label: `route definitions: ${String(discovery.definitions.length)} found in ${String(files.size)} module${files.size === 1 ? "" : "s"}`,
      status:
        discovery.loadFailures.length > 0 || discovery.duplicates.length > 0
          ? "warn"
          : "pass",
    };
  } catch (error) {
    return {
      detail: [message(error)],
      label: "route definitions: discovery failed",
      status: "warn",
    };
  }
}

function readManifest(
  projectRoot: string,
  name: string,
): undefined | { dependencies?: Record<string, string>; version?: unknown } {
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
      ) as { dependencies?: Record<string, string>; version?: unknown };
    } catch {
      if (dirname(dir) === dir) return undefined;
    }
  }
}

/** `1.2.3` / `1.2.3-beta.1` — the shape a published `workspace:*` pin takes. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;

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
  // The packages version INDEPENDENTLY (changesets); comparing the two
  // installed versions against each other warns on every correct install.
  // The real invariant is that the installed core is the one the installed
  // @paramour-js/next declares — `workspace:*` publishes as an exact pin, so
  // when the declaration is exact this is string equality. A non-exact
  // declaration (a range, or `workspace:*` inside this monorepo itself) is
  // the package manager's to enforce; no claim to check.
  const declared = nextManifest?.dependencies?.paramour;
  if (
    declared !== undefined &&
    EXACT_VERSION.test(declared) &&
    core !== declared
  ) {
    return {
      detail: [
        "your package manager should have matched these — check for overrides/resolutions or a stale lockfile, then reinstall",
      ],
      label: `versions: installed paramour ${core} != ${declared}, the version @paramour-js/next ${next} depends on`,
      status: "warn",
    };
  }
  return {
    label: `versions: paramour ${core} satisfies @paramour-js/next ${next}'s declared dependency`,
    status: "pass",
  };
}
