import { join, resolve } from "node:path";

import { emitArtifact, writeIfChanged } from "./emit.js";
import { acquireWatcherLock } from "./lock.js";
import { DEFAULT_PAGE_EXTENSIONS, resolveAppDir, scanRoutes } from "./scan.js";
import { watchAppDir } from "./watch.js";

/** Options for {@link withTypedRoutes} (TR4). */
export interface WithTypedRoutesOptions {
  /**
   * Artifact location, for monorepos where the Next app root isn't where the
   * file should live (TR3 escape hatch). Relative paths resolve against the
   * project root. Default: `paramour-env.d.ts` at the project root.
   */
  outFile?: string;
  /**
   * Upgrade build-phase drift from a loud warning to a build failure (TR4)
   * — for teams that want the committed artifact to be the law. Default
   * `false`, friendly to gitignored-file workflows and CI images.
   */
  strict?: boolean;
}

/** Next config-function form: `(phase, ctx) => config`, possibly async. */
type ConfigFunction<C> = (phase: string, ctx: unknown) => C | Promise<C>;

/**
 * Minimal structural view of a Next config (TR4). `pageExtensions` is the
 * only field the wrapper reads; everything else passes through untouched.
 * Structural on purpose — the package is hermetic (peer-only relationship
 * with `next`). Deliberately NOT the generic constraint: a weak-type
 * constraint would reject every config that doesn't happen to set
 * `pageExtensions` (no properties in common), so the wrapper constrains to
 * `object` and reads this shape off the resolved config instead.
 */
interface NextConfigLike {
  pageExtensions?: readonly string[] | undefined;
}

/**
 * Phase constants from `next/constants`, hardcoded so the package stays
 * hermetic (TR4 hermeticity ruling): the values are stable, documented
 * public API, and importing them would make `next` a runtime dependency.
 */
const PHASE_DEVELOPMENT_SERVER = "phase-development-server";
const PHASE_PRODUCTION_BUILD = "phase-production-build";

/**
 * Reads route paths back out of a previous artifact for the drift diff
 * (TR4). Only ever applied to text this package generated (TR3 deterministic
 * form), so a line-anchored match on union members is exact, not heuristic.
 */
const UNION_MEMBER = /^\s*\| "(.*)";?$/gm;

/**
 * TR6 guard 1 — the in-process singleton, keyed by app dir + artifact path.
 * Load-bearing even for a single `next dev`: the spike-#1 census found
 * Turbopack dev invokes the config function twice in the same process.
 */
const devWatcherTeardowns = new Map<string, () => void>();

/** Messages already logged — "log once" (TR5) across repeat evaluations. */
const warnedOnce = new Set<string>();

/** @internal Test seam: the number of live dev-watcher singletons. */
export function devWatcherCountForTests(): number {
  return devWatcherTeardowns.size;
}

/**
 * @internal Test seam: close every dev watcher, release the pidfile locks,
 * and clear the log-once state. Also required between tests on Windows —
 * an open watch handle blocks temp-dir removal.
 */
export function resetDevWatchersForTests(): void {
  for (const teardown of devWatcherTeardowns.values()) teardown();
  devWatcherTeardowns.clear();
  warnedOnce.clear();
}

/**
 * Wrap a Next config with route-registry generation (TR4). Returns the
 * config-function form; Next's phase argument is the mode discriminator:
 *
 * - production build → one generation pass before the config is returned
 *   (the build type-checks against fresh routes); drift warns loudly, or
 *   fails the build under `strict: true`.
 * - dev server → one immediate generation pass, then the debounced watcher
 *   (TR5) behind both single-writer guards (TR6).
 * - every other phase → pass-through, no generation.
 */
export function withTypedRoutes<C extends object>(
  config: C | ConfigFunction<C>,
  options: WithTypedRoutesOptions = {},
): ConfigFunction<C> {
  return async (phase, ctx) => {
    const resolved =
      typeof config === "function" ? await config(phase, ctx) : config;
    if (phase !== PHASE_DEVELOPMENT_SERVER && phase !== PHASE_PRODUCTION_BUILD)
      return resolved;

    // The dev server and every build worker evaluate the config with the
    // project root as cwd (spike-#1 census); TR7's CLI flags are the home
    // for anything more configurable than this.
    const projectRoot = process.cwd();
    const artifactPath = resolve(
      projectRoot,
      options.outFile ?? "paramour-env.d.ts",
    );
    const appDir = resolveAppDir(projectRoot);
    if (appDir === undefined) {
      // §7.3: codegen is never load-bearing — a config wrapper must not
      // take down `next dev`/`next build` over a missing app dir.
      warnOnce(
        `paramour: no app directory (app/ or src/app/) under ${projectRoot}; route generation skipped`,
      );
      return resolved;
    }
    const pageExtensions =
      (resolved as NextConfigLike).pageExtensions ?? DEFAULT_PAGE_EXTENSIONS;

    if (phase === PHASE_PRODUCTION_BUILD) {
      generateForBuild(
        appDir,
        pageExtensions,
        artifactPath,
        options.strict ?? false,
      );
      return resolved;
    }
    generateSafely(appDir, pageExtensions, artifactPath);
    startDevWatcher(projectRoot, appDir, pageExtensions, artifactPath);
    return resolved;
  };
}

/**
 * Build-phase pass (TR4): regenerate, then warn loudly on drift — naming the
 * paths that appeared/disappeared — but continue; `strict` upgrades drift to
 * a thrown error *after* the file is already corrected. A missing artifact
 * counts as drift: that is exactly the CI-degrades-to-world-A scenario the
 * committed file exists to prevent (TR3).
 */
function generateForBuild(
  appDir: string,
  pageExtensions: readonly string[],
  artifactPath: string,
  strict: boolean,
): void {
  let routes: string[];
  let previousContent: null | string;
  let written: boolean;
  try {
    routes = scanRoutes(appDir, pageExtensions);
    ({ previousContent, written } = writeIfChanged(
      artifactPath,
      emitArtifact(routes),
    ));
  } catch (error) {
    // §7.3 again: incidental generation failure is stale types, not a
    // broken build. Only *drift* is allowed to fail a strict build.
    console.warn(
      "paramour: route generation failed; building with stale route types",
      error,
    );
    return;
  }
  if (!written) return;

  const previous = parseUnionPaths(previousContent);
  const fresh = new Set(routes);
  const appeared = routes.filter((path) => !previous.has(path));
  const disappeared = [...previous].filter((path) => !fresh.has(path));
  const message = [
    previousContent === null
      ? `paramour: ${artifactPath} was missing and has been generated.`
      : `paramour: ${artifactPath} was out of date and has been regenerated.`,
    ...appeared.map((path) => `  + ${path}`),
    ...disappeared.map((path) => `  - ${path}`),
    "Commit the regenerated file, or run `paramour generate` before building.",
  ].join("\n");
  if (strict) throw new Error(message);
  console.warn(message);
}

/** Dev-phase generation (TR4): failure warns and continues (§7.3). */
function generateSafely(
  appDir: string,
  pageExtensions: readonly string[],
  artifactPath: string,
): void {
  try {
    writeIfChanged(
      artifactPath,
      emitArtifact(scanRoutes(appDir, pageExtensions)),
    );
  } catch (error) {
    console.warn(
      "paramour: route generation failed; dev continues with stale route types",
      error,
    );
  }
}

/** Route paths in a previously emitted artifact; empty for a missing file. */
function parseUnionPaths(previousContent: null | string): Set<string> {
  const paths = new Set<string>();
  if (previousContent === null) return paths;
  for (const match of previousContent.matchAll(UNION_MEMBER)) {
    const [, path] = match;
    if (path !== undefined) paths.add(path);
  }
  return paths;
}

/**
 * Start the dev watcher behind both TR6 guards. Failure at any layer leaves
 * dev running in stale-types mode — never fatal (TR5).
 */
function startDevWatcher(
  projectRoot: string,
  appDir: string,
  pageExtensions: readonly string[],
  artifactPath: string,
): void {
  const key = `${appDir} ${artifactPath}`;
  if (devWatcherTeardowns.has(key)) return;

  const lock = acquireWatcherLock(
    join(projectRoot, "node_modules", ".cache", "paramour", "watcher.lock"),
  );
  if (!lock.acquired) {
    // TR6: another live process owns the watcher (e.g. `paramour generate
    // --watch` beside `next dev`). Initial generation above already ran, so
    // dev is still correct from second zero.
    console.warn(
      `paramour: watcher already running (pid ${String(lock.ownerPid)})`,
    );
    return;
  }

  const watcher = watchAppDir(appDir, {
    ignorePaths: [artifactPath],
    onError: (error) => {
      warnOnce(
        "paramour: dev watcher failed; dev continues with stale route types",
        error,
      );
    },
    onRescan: () => {
      writeIfChanged(
        artifactPath,
        emitArtifact(scanRoutes(appDir, pageExtensions)),
      );
    },
  });
  // A failed watchAppDir returns a no-op handle and is still registered:
  // retrying on every config re-evaluation would just warn repeatedly.
  devWatcherTeardowns.set(key, () => {
    watcher.close();
    lock.release?.();
  });
}

/** TR5 "log once": repeat evaluations/events don't spam the dev console. */
function warnOnce(message: string, detail?: unknown): void {
  if (warnedOnce.has(message)) return;
  warnedOnce.add(message);
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}
