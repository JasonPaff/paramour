import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The `paramour init` next.config codemod (magicast: recast printing +
 * babel-ts parsing, so TS/ESM configs transform format-preservingly).
 * Anything the transform can't handle CONFIDENTLY degrades to a `manual`
 * result carrying the exact snippet — init prints it and still exits 0; a
 * printed instruction beats a mangled config.
 */

/** A next.config file found at the project root. */
export interface FoundNextConfig {
  lang: "js" | "mjs" | "ts";
  path: string;
}

export type WrapResult =
  | { code: string; status: "wrapped" }
  | { snippet: string; status: "manual" }
  | { status: "already-wrapped" };

/** Minimal structural view of a magicast proxy — enough to detect a call. */
interface ProxiedNode {
  $callee?: unknown;
  $type?: unknown;
}

const IMPORT_LINE = `import { withTypedRoutes } from "@paramour-js/next";`;

/**
 * Wrap-state probe for `doctor`: same import/callee detection the codemod
 * uses for idempotence, without mutating anything.
 */
export async function detectWrapState(
  source: string,
): Promise<"not-wrapped" | "unparseable" | "wrapped"> {
  const { parseModule } = await import("magicast");
  try {
    const mod = parseModule<Record<string, unknown>>(source);
    const local = withTypedRoutesLocal(mod.imports.$items);
    return isWrappedCall(mod.exports.default, local)
      ? "wrapped"
      : "not-wrapped";
  } catch {
    return "unparseable";
  }
}

/** Probe order mirrors init's scaffolding preference: ts, mjs, js. */
export function findNextConfig(
  projectRoot: string,
): FoundNextConfig | undefined {
  const probes: [string, FoundNextConfig["lang"]][] = [
    ["next.config.ts", "ts"],
    ["next.config.mjs", "mjs"],
    ["next.config.js", "js"],
  ];
  for (const [name, lang] of probes) {
    const path = join(projectRoot, name);
    if (existsSync(path)) return { lang, path };
  }
  return undefined;
}

/** The `manual` fallback text — also printed when no config file exists. */
export function manualSnippet(): string {
  return [
    IMPORT_LINE,
    "",
    "// wrap your existing config export:",
    "export default withTypedRoutes(nextConfig);",
  ].join("\n");
}

/**
 * The transform: add the named import (unless present under any alias) and
 * rewrap the default export — identifier, object literal, existing wrapper
 * call (`withBundleAnalyzer(...)` → wrapped outermost), or function/arrow
 * form (withTypedRoutes accepts the config-function shape) all take the
 * same path. Manual fallbacks: parse failure, no default export (includes
 * CJS `module.exports` — this package is ESM-only, so a generated
 * `require()` would be a trap), or any shape magicast refuses to rebuild.
 * Idempotent: an already-wrapped export is detected, never double-wrapped.
 */
export async function wrapNextConfigSource(
  source: string,
): Promise<WrapResult> {
  const { builders, generateCode, parseModule } = await import("magicast");
  let mod;
  try {
    mod = parseModule<Record<string, unknown>>(source);
  } catch {
    return { snippet: manualSnippet(), status: "manual" };
  }
  try {
    const local = withTypedRoutesLocal(mod.imports.$items);
    const current: unknown = mod.exports.default;
    if (current === undefined) {
      return { snippet: manualSnippet(), status: "manual" };
    }
    if (isWrappedCall(current, local)) {
      return { status: "already-wrapped" };
    }
    if (local === undefined) {
      mod.imports.$prepend({
        from: "@paramour-js/next",
        imported: "withTypedRoutes",
      });
    }
    mod.exports.default = builders.functionCall(
      local ?? "withTypedRoutes",
      current,
    );
    return { code: generateCode(mod).code, status: "wrapped" };
  } catch {
    return { snippet: manualSnippet(), status: "manual" };
  }
}

function isWrappedCall(value: unknown, local: string | undefined): boolean {
  if (typeof value !== "object" || value === null) return false;
  const node = value as ProxiedNode;
  return (
    node.$type === "function-call" &&
    typeof node.$callee === "string" &&
    // Member-expression callees (`ptr.withTypedRoutes(...)`) count even
    // without a named import — a namespace-wrapped config must not be
    // double-wrapped (the prepended named import would be invalid ES).
    ((local !== undefined && node.$callee === local) ||
      node.$callee.endsWith(".withTypedRoutes"))
  );
}

function withTypedRoutesLocal(
  items: readonly { from: string; imported: string; local: string }[],
): string | undefined {
  return items.find(
    (item) =>
      item.from === "@paramour-js/next" && item.imported === "withTypedRoutes",
  )?.local;
}
