import { resolve } from "node:path";

import { RouteCollisionError } from "./collisions.js";
import {
  diffGenerated,
  formatRouteDiff,
  generate,
  type GenerateResult,
} from "./generate.js";
import {
  type AcquireLockResult,
  acquireWatcherLock,
  watcherLockPath,
} from "./lock.js";
import { DEFAULT_PAGE_EXTENSIONS } from "./scan-app.js";
import { resolveRouteDirs, type RouteDirs } from "./scan.js";
import { watchRouteDirs } from "./watch.js";

/** Options for {@link withTypedRoutes}. */
export interface WithTypedRoutesOptions {
  /**
   * Artifact location, for monorepos where the Next app root isn't where the
   * file should live — the escape hatch. Relative paths resolve against the
   * project root. Default: `paramour-env.d.ts` at the project root.
   */
  outFile?: string;
  /**
   * Upgrade build-phase drift from a loud warning to a build failure — for
   * teams that want the committed artifact to be the law. Default `false`,
   * friendly to gitignored-file workflows and CI images.
   */
  strict?: boolean;
}

/** Next config-function form: `(phase, ctx) => config`, possibly async. */
type ConfigFunction<C> = (phase: string, ctx: unknown) => C | Promise<C>;

/**
 * Minimal structural view of a Next config. `pageExtensions` is the only
 * field the wrapper reads; everything else passes through untouched.
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
 * hermetic: the values are stable, documented public API, and importing them
 * would make `next` a runtime dependency.
 */
const PHASE_DEVELOPMENT_SERVER = "phase-development-server";
const PHASE_PRODUCTION_BUILD = "phase-production-build";

/**
 * The in-process single-writer guard — a singleton keyed by route dirs +
 * artifact path. Load-bearing even for a single `next dev`: Turbopack dev
 * invokes the config function twice in the same process.
 */
const devWatcherTeardowns = new Map<string, () => void>();

/** Messages already logged — "log once" across repeat evaluations. */
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
 * Wrap a Next config with route-registry generation. Returns the
 * config-function form; Next's phase argument is the mode discriminator:
 *
 * - production build → one generation pass before the config is returned
 *   (the build type-checks against fresh routes); drift warns loudly, or
 *   fails the build under `strict: true`.
 * - dev server → one immediate generation pass, then the debounced watcher
 *   behind both single-writer guards (the in-process singleton and the
 *   cross-process pidfile lock).
 * - every other phase → pass-through, no generation.
 *
 * Two states throw during config evaluation instead of degrading to
 * stale-types mode, both phases alike, because Next itself has no valid
 * build for them: an app↔pages route collision, and discovery's
 * populated-ignored-dir config error (Next is silently serving none of those
 * pages).
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
    // project root as cwd; the CLI flags are the home for anything more
    // configurable than this.
    const projectRoot = process.cwd();
    const artifactPath = resolve(
      projectRoot,
      options.outFile ?? "paramour-env.d.ts",
    );
    const pageExtensions =
      (resolved as NextConfigLike).pageExtensions ?? DEFAULT_PAGE_EXTENSIONS;
    // May throw the populated-ignored-dir config error — deliberately not
    // caught (see above).
    const dirs = resolveRouteDirs(projectRoot, pageExtensions);
    if (dirs.appDir === undefined && dirs.pagesDir === undefined) {
      // Codegen is never load-bearing — a config wrapper must not take down
      // `next dev`/`next build` over a missing route dir.
      warnOnce(
        `paramour: no route directory (app/, pages/, src/app/, or src/pages/) under ${projectRoot}; route generation skipped`,
      );
      return resolved;
    }

    if (phase === PHASE_PRODUCTION_BUILD) {
      generateForBuild(
        dirs,
        pageExtensions,
        artifactPath,
        options.strict ?? false,
      );
      return resolved;
    }
    generateSafely(dirs, pageExtensions, artifactPath);
    startDevWatcher(projectRoot, dirs, pageExtensions, artifactPath);
    return resolved;
  };
}

/**
 * Build-phase pass: regenerate, then warn loudly on drift — naming the paths
 * that appeared/disappeared and the router they moved in — but continue;
 * `strict` upgrades drift to a thrown error *after* the file is already
 * corrected. A missing artifact counts as drift: that is exactly the
 * CI-degrades-to-world-A scenario the committed file exists to prevent. A
 * route collision is NOT incidental failure and rethrows.
 */
function generateForBuild(
  dirs: RouteDirs,
  pageExtensions: readonly string[],
  artifactPath: string,
  strict: boolean,
): void {
  let result: GenerateResult;
  try {
    result = generate({ ...dirs, artifactPath, pageExtensions });
  } catch (error) {
    // Next fails this build anyway; surfacing the collision from the config
    // evaluation names the actual problem instead of leaving a stale
    // artifact to confuse the type errors that follow.
    if (error instanceof RouteCollisionError) throw error;
    // Again: incidental generation failure is stale types, not a broken
    // build. Only *drift* is allowed to fail a strict build.
    console.warn(
      "paramour: route generation failed; building with stale route types",
      error,
    );
    return;
  }
  if (!result.written) return;

  const drift = diffGenerated(result);
  const message = [
    result.previousContent === null
      ? `paramour: ${artifactPath} was missing and has been generated.`
      : `paramour: ${artifactPath} was out of date and has been regenerated.`,
    ...formatRouteDiff(drift.app, drift.pages),
    "Commit the regenerated file, or run `paramour generate` before building.",
  ].join("\n");
  if (strict) throw new Error(message);
  console.warn(message);
}

/**
 * Dev-phase generation: failure warns and continues (codegen is never
 * load-bearing) — except a route collision, which throws from the config
 * evaluation here exactly as in the build phase; only the running WATCHER
 * treats it non-fatally.
 */
function generateSafely(
  dirs: RouteDirs,
  pageExtensions: readonly string[],
  artifactPath: string,
): void {
  try {
    generate({ ...dirs, artifactPath, pageExtensions });
  } catch (error) {
    if (error instanceof RouteCollisionError) throw error;
    console.warn(
      "paramour: route generation failed; dev continues with stale route types",
      error,
    );
  }
}

/**
 * Start the dev watcher behind both single-writer guards. Failure at any
 * layer leaves dev running in stale-types mode — never fatal.
 */
function startDevWatcher(
  projectRoot: string,
  dirs: RouteDirs,
  pageExtensions: readonly string[],
  artifactPath: string,
): void {
  const watchedDirs = [dirs.appDir, dirs.pagesDir].filter(
    (dir): dir is string => dir !== undefined,
  );
  const key = `${watchedDirs.join(" ")} ${artifactPath}`;
  if (devWatcherTeardowns.has(key)) return;

  let lock: AcquireLockResult;
  try {
    lock = acquireWatcherLock(watcherLockPath(projectRoot));
  } catch (error) {
    // A corrupt lock location (e.g. a directory at the pidfile path) must
    // not take down `next dev` — stale-types mode, like every other
    // watcher-layer failure.
    warnOnce(
      "paramour: dev watcher failed; dev continues with stale route types",
      error,
    );
    return;
  }
  if (!lock.acquired) {
    // Another live process owns the watcher (e.g. `paramour generate
    // --watch` beside `next dev`). Initial generation above already ran, so
    // dev is still correct from second zero.
    console.warn(
      `paramour: watcher already running (pid ${String(lock.ownerPid)})`,
    );
    return;
  }

  const watcher = watchRouteDirs(watchedDirs, {
    ignorePaths: [artifactPath],
    onError: (error) => {
      warnOnce(
        "paramour: dev watcher failed; dev continues with stale route types",
        error,
      );
    },
    onRescan: () => {
      try {
        generate({ ...dirs, artifactPath, pageExtensions });
      } catch (error) {
        if (error instanceof RouteCollisionError) {
          // The collision watch exception: a mid-watch collision is usually
          // a file mid-move — log loudly every time (not once: it stays
          // broken until fixed), keep the last good artifact, keep running.
          console.warn(
            `paramour: ${error.message}; dev continues with the last good artifact`,
          );
          return;
        }
        throw error; // routed to onError by the watcher — non-fatal
      }
    },
  });
  // A failed watchRouteDirs returns a no-op handle and is still registered:
  // retrying on every config re-evaluation would just warn repeatedly.
  devWatcherTeardowns.set(key, () => {
    watcher.close();
    lock.release?.();
  });
}

/** "Log once": repeat evaluations/events don't spam the dev console. */
function warnOnce(message: string, detail?: unknown): void {
  if (warnedOnce.has(message)) return;
  warnedOnce.add(message);
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}
