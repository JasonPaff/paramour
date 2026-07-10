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
  /** App-router drift — split per router so the report names it (PR9). */
  app: RouterDrift;
  /** `true` when the artifact file does not exist at all. */
  missingFile: boolean;
  /** Pages-router drift. */
  pages: RouterDrift;
  /** `true` on a byte-identical artifact — the only non-drift state. */
  upToDate: boolean;
}

/** Inputs to one generation/check pass; either dir may be absent (PR1). */
export interface GenerateInputs {
  appDir?: string | undefined;
  artifactPath: string;
  pageExtensions: readonly string[];
  pagesDir?: string | undefined;
}

/** Result of {@link generate}. */
export interface GenerateResult {
  /** The freshly scanned app-route union (sorted). */
  appRoutes: string[];
  /** The freshly scanned pages-route union (sorted). */
  pagesRoutes: string[];
  /** Prior artifact content, `null` when the file did not exist. */
  previousContent: null | string;
  /** `false` on a byte-identical no-op (TR3 write-if-changed). */
  written: boolean;
}

/** One router's appeared/disappeared route paths (TR4/TR7 drift). */
export interface RouterDrift {
  /** Routes on disk (scan) that the artifact lacks. */
  appeared: string[];
  /** Routes in the artifact that no longer exist on disk. */
  disappeared: string[];
}

/**
 * Reads the per-router unions back out of a previously emitted artifact for
 * drift diffs (TR4/TR7). Only ever applied to text this package generated
 * (TR3 deterministic form), so line-anchored matches on the member headers
 * and union members are exact, not heuristic. `\s*$` on both tolerates a
 * CRLF-resaved artifact.
 */
const MEMBER_HEADER = /^\s*(appRoutes|pagesRoutes):\s*$/;
const UNION_MEMBER = /^\s*\| "(.*)";?\s*$/;

/**
 * `--check` (TR7): scan to memory and byte-compare against disk — never
 * writes. A missing artifact is drift, not an error: that is exactly the
 * CI-degrades-to-world-A case the committed file exists to prevent (TR3).
 */
export function checkArtifact(inputs: GenerateInputs): CheckResult {
  const routes = scanRoutes(inputs, inputs.pageExtensions);
  const expected = emitArtifact(routes);
  const current = existsSync(inputs.artifactPath)
    ? readFileSync(inputs.artifactPath, "utf8")
    : null;
  if (current === expected) {
    return {
      app: { appeared: [], disappeared: [] },
      missingFile: false,
      pages: { appeared: [], disappeared: [] },
      upToDate: true,
    };
  }
  const previous = parseArtifactRoutes(current);
  return {
    app: diffRouter(routes.appRoutes, previous.appRoutes),
    missingFile: current === null,
    pages: diffRouter(routes.pagesRoutes, previous.pagesRoutes),
    upToDate: false,
  };
}

/**
 * Per-router drift of a completed {@link generate} pass against the artifact
 * it replaced — the wrapper's build-phase drift report (TR4).
 */
export function diffGenerated(result: GenerateResult): {
  app: RouterDrift;
  pages: RouterDrift;
} {
  const previous = parseArtifactRoutes(result.previousContent);
  return {
    app: diffRouter(result.appRoutes, previous.appRoutes),
    pages: diffRouter(result.pagesRoutes, previous.pagesRoutes),
  };
}

/**
 * The `  + /new (app)` / `  - /old (pages)` lines of a drift report
 * (TR4/TR7) — each line names the router its path moved in (PR9).
 */
export function formatRouteDiff(
  app: RouterDrift,
  pages: RouterDrift,
): string[] {
  return [
    ...app.appeared.map((path) => `  + ${path} (app)`),
    ...pages.appeared.map((path) => `  + ${path} (pages)`),
    ...app.disappeared.map((path) => `  - ${path} (app)`),
    ...pages.disappeared.map((path) => `  - ${path} (pages)`),
  ];
}

/** One generation pass: scan → emit → write-if-changed (TR3). */
export function generate(inputs: GenerateInputs): GenerateResult {
  const routes = scanRoutes(inputs, inputs.pageExtensions);
  return {
    ...routes,
    ...writeIfChanged(inputs.artifactPath, emitArtifact(routes)),
  };
}

/**
 * Per-router route paths in a previously emitted artifact; both empty for a
 * missing file or the empty merge.
 */
export function parseArtifactRoutes(previousContent: null | string): {
  appRoutes: Set<string>;
  pagesRoutes: Set<string>;
} {
  const appRoutes = new Set<string>();
  const pagesRoutes = new Set<string>();
  if (previousContent === null) return { appRoutes, pagesRoutes };
  let current: Set<string> | undefined;
  for (const line of previousContent.split("\n")) {
    const header = MEMBER_HEADER.exec(line);
    if (header !== null) {
      current = header[1] === "appRoutes" ? appRoutes : pagesRoutes;
      continue;
    }
    const member = UNION_MEMBER.exec(line);
    if (member !== null) {
      const [, path] = member;
      if (path !== undefined) current?.add(path);
      continue;
    }
    // Any other line ends the member block — union members are contiguous
    // in the TR3 deterministic form.
    current = undefined;
  }
  return { appRoutes, pagesRoutes };
}

function diffRouter(
  fresh: readonly string[],
  previous: ReadonlySet<string>,
): RouterDrift {
  const freshSet = new Set(fresh);
  return {
    appeared: fresh.filter((path) => !previous.has(path)),
    disappeared: [...previous].filter((path) => !freshSet.has(path)),
  };
}
