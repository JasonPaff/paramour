import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { resolveRouteDirs } from "../scan.js";

/** One line of init's detect-and-verify summary; `ok: false` renders ⚠. */
export interface SetupCheck {
  detail?: string;
  label: string;
  ok: boolean;
}

/**
 * Insert `"paramour": "paramour generate"` into a package.json's scripts,
 * preserving the file's own indentation and trailing-newline choice.
 * Throws on malformed JSON — a broken package.json is init's one hard
 * prerequisite failure.
 */
export function addPackageScript(text: string): {
  changed: boolean;
  text: string;
} {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("package.json must contain an object");
  }
  const pkg = parsed as { scripts?: unknown };
  if (
    pkg.scripts !== undefined &&
    (typeof pkg.scripts !== "object" ||
      pkg.scripts === null ||
      Array.isArray(pkg.scripts))
  ) {
    // Spreading an array/string would silently rewrite it as index keys.
    throw new Error(`"scripts" must be an object`);
  }
  const scripts = pkg.scripts as Record<string, unknown> | undefined;
  if (scripts?.paramour !== undefined) return { changed: false, text };
  pkg.scripts = { ...scripts, paramour: "paramour generate" };
  const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
  const trailing = text.endsWith("\n") ? "\n" : "";
  return { changed: true, text: JSON.stringify(pkg, null, indent) + trailing };
}

/**
 * The detect-and-verify summary: route dirs discoverable, both packages
 * declared, tsconfig covering the artifact. Warn-level throughout — a fresh
 * project legitimately fails several of these, so none affect init's exit
 * code.
 */
export function checkSetup(
  projectRoot: string,
  artifactPath: string,
): SetupCheck[] {
  const checks: SetupCheck[] = [];
  try {
    const dirs = resolveRouteDirs(projectRoot);
    const found = [dirs.appDir, dirs.pagesDir]
      .filter((dir): dir is string => dir !== undefined)
      .map((dir) => `${relative(projectRoot, dir).replaceAll("\\", "/")}/`);
    checks.push(
      found.length > 0
        ? { label: `route directories: ${found.join(", ")}`, ok: true }
        : {
            detail: "create app/ or pages/, then run `paramour generate`",
            label: "no route directory found yet",
            ok: false,
          },
    );
  } catch (error) {
    checks.push({
      detail: error instanceof Error ? error.message : String(error),
      label: "route-directory discovery failed",
      ok: false,
    });
  }
  checks.push(dependenciesCheck(projectRoot));
  checks.push(tsconfigCheck(projectRoot, artifactPath));
  return checks;
}

/** The starter `paramour.config.ts` — every field commented-out defaults. */
export function paramourConfigTemplate(): string {
  return [
    `import type { ParamourConfig } from "@paramour-js/next";`,
    "",
    "/**",
    " * Paramour CLI configuration. Every field is optional and every value",
    " * below is the default — deleting this file changes nothing.",
    " */",
    "export default {",
    `  // appDir: "app",`,
    `  // outFile: "paramour-env.d.ts",`,
    `  // pageExtensions: ["tsx", "ts", "jsx", "js"],`,
    `  // pagesDir: "pages",`,
    `  // routeFiles: ["src/routes/**/*.ts"], // pin \`paramour list\`'s definition scan`,
    "} satisfies ParamourConfig;",
    "",
  ].join("\n");
}

/**
 * Tolerant-enough JSONC → JSON for tsconfig reads: strips line and block
 * comments outside strings, then trailing commas. Heuristic by design — the
 * one consumer is a warn-level check.
 */
export function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    // charAt, not indexing: "" past the end instead of undefined, so the
    // lookahead needs no noUncheckedIndexedAccess dance.
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next;
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text.charAt(i) !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (
        i < text.length &&
        !(text.charAt(i) === "*" && text.charAt(i + 1) === "/")
      ) {
        i++;
      }
      i++;
      continue;
    }
    out += ch;
  }
  return stripTrailingCommas(out);
}

/** Exported for `doctor`, which reports the same heuristic as its own check. */
export function tsconfigCheck(
  projectRoot: string,
  artifactPath: string,
): SetupCheck {
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  const artifactRel = relative(projectRoot, artifactPath).replaceAll("\\", "/");
  if (!existsSync(tsconfigPath)) {
    return {
      label: "no tsconfig.json — artifact-coverage check skipped",
      ok: true,
    };
  }
  let include: unknown;
  try {
    const parsed = JSON.parse(
      stripJsonComments(readFileSync(tsconfigPath, "utf8")),
    ) as { include?: unknown };
    include = parsed.include;
  } catch {
    return {
      detail: `could not parse it; make sure "${artifactRel}" is covered by \`include\``,
      label: "tsconfig.json unreadable — artifact coverage unverified",
      ok: false,
    };
  }
  if (include === undefined) {
    return {
      label: `tsconfig.json covers ${artifactRel} (no include list)`,
      ok: true,
    };
  }
  if (
    Array.isArray(include) &&
    include.some(
      (pattern) =>
        typeof pattern === "string" &&
        tsconfigPatternCovers(pattern, artifactRel),
    )
  ) {
    return { label: `tsconfig.json includes ${artifactRel}`, ok: true };
  }
  return {
    detail: `add "${artifactRel}" to \`include\` so the registry augmentation loads`,
    label: `tsconfig include may not cover ${artifactRel}`,
    ok: false,
  };
}

/**
 * Does a tsconfig `include` pattern cover the artifact? NOT a glob engine:
 * exact match, directory prefix, or a `**` pattern whose extension can
 * match a `.d.ts` (Next's default globstar-`.ts` include is the target case).
 */
export function tsconfigPatternCovers(
  pattern: string,
  artifactRel: string,
): boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized === artifactRel) return true;
  if (!normalized.includes("*")) {
    return artifactRel.startsWith(`${normalized.replace(/\/$/, "")}/`);
  }
  // The literal directory prefix before the first wildcard still restricts
  // the match: `src/**/*.ts` cannot cover a root-level artifact.
  const prefix = normalized
    .slice(0, normalized.indexOf("*"))
    .replace(/[^/]*$/, "");
  return (
    artifactRel.startsWith(prefix) &&
    normalized.includes("**") &&
    (normalized.endsWith(".ts") || normalized.endsWith("*"))
  );
}

function dependenciesCheck(projectRoot: string): SetupCheck {
  let declared: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    declared = { ...parsed.dependencies, ...parsed.devDependencies };
  } catch {
    // Unreadable package.json is reported by init's own prerequisite check.
  }
  const missing = ["@paramour-js/next", "paramour"].filter(
    (name) => declared[name] === undefined,
  );
  return missing.length === 0
    ? { label: "dependencies declared: paramour, @paramour-js/next", ok: true }
    : {
        detail: "add them to package.json and install",
        label: `missing dependencies: ${missing.join(", ")}`,
        ok: false,
      };
}

/**
 * String-aware trailing-comma removal over comment-free JSONC — a flat
 * regex would also rewrite `,}`/`,]` inside string literals (glob patterns).
 */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text.charAt(i + 1);
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text.charAt(j))) j++;
      const sig = text.charAt(j);
      if (sig === "}" || sig === "]") continue;
    }
    out += ch;
  }
  return out;
}
