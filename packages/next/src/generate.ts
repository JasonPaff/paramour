import { existsSync, readFileSync } from "node:fs";

import { emitArtifact, writeIfChanged } from "./emit.js";
import { scanRoutes } from "./scan.js";

/**
 * The shared generation engine (TR9): `withTypedRoutes` and the CLI drive
 * these same functions, so wrapper and `paramour generate` cannot drift on
 * what a pass produces. Everything here is @internal — not barrel API.
 */

/** Result of {@link checkArtifact}. */
export interface CheckResult {
  /** Routes on disk (scan) that the artifact lacks. */
  appeared: string[];
  /** Routes in the artifact that no longer exist on disk. */
  disappeared: string[];
  /** `true` when the artifact file does not exist at all. */
  missingFile: boolean;
  /** `true` on a byte-identical artifact — the only non-drift state. */
  upToDate: boolean;
}

/** Inputs to one generation/check pass. */
export interface GenerateInputs {
  appDir: string;
  artifactPath: string;
  pageExtensions: readonly string[];
}

/** Result of {@link generate}. */
export interface GenerateResult {
  /** Prior artifact content, `null` when the file did not exist. */
  previousContent: null | string;
  /** The freshly scanned route union (sorted, deduped). */
  routes: string[];
  /** `false` on a byte-identical no-op (TR3 write-if-changed). */
  written: boolean;
}

/**
 * Reads route paths back out of a previously emitted artifact for drift
 * diffs (TR4/TR7). Only ever applied to text this package generated (TR3
 * deterministic form), so a line-anchored match on union members is exact,
 * not heuristic.
 */
const UNION_MEMBER = /^\s*\| "(.*)";?$/gm;

/**
 * `--check` (TR7): scan to memory and byte-compare against disk — never
 * writes. A missing artifact is drift, not an error: that is exactly the
 * CI-degrades-to-world-A case the committed file exists to prevent (TR3).
 */
export function checkArtifact(inputs: GenerateInputs): CheckResult {
  const routes = scanRoutes(inputs.appDir, inputs.pageExtensions);
  const expected = emitArtifact(routes);
  const current = existsSync(inputs.artifactPath)
    ? readFileSync(inputs.artifactPath, "utf8")
    : null;
  if (current === expected) {
    return {
      appeared: [],
      disappeared: [],
      missingFile: false,
      upToDate: true,
    };
  }
  const previous = parseUnionPaths(current);
  const fresh = new Set(routes);
  return {
    appeared: routes.filter((path) => !previous.has(path)),
    disappeared: [...previous].filter((path) => !fresh.has(path)),
    missingFile: current === null,
    upToDate: false,
  };
}

/** The `  + /new` / `  - /old` lines of a drift report (TR4/TR7). */
export function formatRouteDiff(
  appeared: readonly string[],
  disappeared: readonly string[],
): string[] {
  return [
    ...appeared.map((path) => `  + ${path}`),
    ...disappeared.map((path) => `  - ${path}`),
  ];
}

/** One generation pass: scan → emit → write-if-changed (TR3). */
export function generate(inputs: GenerateInputs): GenerateResult {
  const routes = scanRoutes(inputs.appDir, inputs.pageExtensions);
  return {
    routes,
    ...writeIfChanged(inputs.artifactPath, emitArtifact(routes)),
  };
}

/** Route paths in a previously emitted artifact; empty for a missing file. */
export function parseUnionPaths(previousContent: null | string): Set<string> {
  const paths = new Set<string>();
  if (previousContent === null) return paths;
  for (const match of previousContent.matchAll(UNION_MEMBER)) {
    const [, path] = match;
    if (path !== undefined) paths.add(path);
  }
  return paths;
}
