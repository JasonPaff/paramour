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

/** Minimal structural view of a babel AST node, for {@link readTrailingSlash}. */
interface AstNode {
  readonly [key: string]: unknown;
  readonly type: string;
}

/** Minimal structural view of a magicast proxy — enough to detect a call. */
interface ProxiedNode {
  $callee?: unknown;
  $type?: unknown;
}

const IMPORT_LINE = `import { withTypedRoutes } from "@paramour-js/next";`;

/** {@link writtenBindings}' name for `module.exports` (no identifier has a dot). */
const MODULE_EXPORTS = "module.exports";

/** The `Object` statics that write their first argument's properties. */
const OBJECT_WRITERS = new Set([
  "assign",
  "defineProperties",
  "defineProperty",
]);

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
 * Reads `trailingSlash` from a next.config source for `doctor`, statically:
 * the default export (or CJS `module.exports`) is followed through
 * single-argument wrapper calls, TS `as`/`satisfies`, and top-level bindings
 * to an object literal. A literal without the key is Next's default, `false`.
 * Anything else (a config function, a non-literal value, a spread that could
 * carry the key, a multi-argument call, a binding written after its
 * declaration) is `undefined`: doctor stays quiet rather than guess, since
 * evaluating the config would run user code.
 */
export async function readTrailingSlash(
  source: string,
): Promise<boolean | undefined> {
  const { parseModule } = await import("magicast");
  let program: AstNode;
  try {
    program = parseModule(source).$ast as AstNode;
  } catch {
    return undefined;
  }
  const written = writtenBindings(program);
  const body = asNodes(program.body);
  const bindings = new Map<string, unknown>();
  let exported: unknown;
  for (const statement of body) {
    if (statement.type === "VariableDeclaration") {
      for (const declarator of asNodes(statement.declarations)) {
        const id = asNode(declarator.id);
        if (
          id?.type === "Identifier" &&
          typeof id.name === "string" &&
          !written.has(id.name)
        ) {
          bindings.set(id.name, declarator.init);
        }
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      exported = statement.declaration;
    } else if (statement.type === "ExpressionStatement") {
      const expression = asNode(statement.expression);
      if (
        expression?.type === "AssignmentExpression" &&
        isModuleExports(asNode(expression.left))
      ) {
        exported = written.has(MODULE_EXPORTS) ? undefined : expression.right;
      }
    }
  }
  return trailingSlashOf(exported, bindings, 0);
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

function asNode(value: unknown): AstNode | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
    ? (value as AstNode)
    : undefined;
}

function asNodes(value: unknown): AstNode[] {
  return Array.isArray(value)
    ? value.flatMap((item: unknown) => asNode(item) ?? [])
    : [];
}

function isModuleExports(node: AstNode | undefined): boolean {
  if (node?.type !== "MemberExpression" || node.computed === true) return false;
  const object = asNode(node.object);
  const property = asNode(node.property);
  return (
    object?.type === "Identifier" &&
    object.name === "module" &&
    property?.type === "Identifier" &&
    property.name === "exports"
  );
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

function propertyName(node: AstNode): string | undefined {
  if (node.computed === true) return undefined;
  const key = asNode(node.key);
  if (key?.type === "Identifier" && typeof key.name === "string") {
    return key.name;
  }
  if (key?.type === "StringLiteral" && typeof key.value === "string") {
    return key.value;
  }
  return undefined;
}

/**
 * One resolution step of {@link readTrailingSlash}. The depth bound stops a
 * self-referencing binding (`const a = f(a)`) from looping.
 */
function trailingSlashOf(
  value: unknown,
  bindings: ReadonlyMap<string, unknown>,
  depth: number,
): boolean | undefined {
  const node = asNode(value);
  if (node === undefined || depth > 16) return undefined;
  switch (node.type) {
    case "CallExpression": {
      // Only a single-argument wrapper (`withTypedRoutes(config)`, curried
      // `withX(options)(config)`) is followed. With more arguments nothing
      // says which one is the config, and plugin options often come first.
      const [only, ...rest] = asNodes(node.arguments);
      return rest.length === 0
        ? trailingSlashOf(only, bindings, depth + 1)
        : undefined;
    }
    case "Identifier": {
      return typeof node.name === "string" && bindings.has(node.name)
        ? trailingSlashOf(bindings.get(node.name), bindings, depth + 1)
        : undefined;
    }
    case "ObjectExpression": {
      // Last write wins, as at runtime; any spread could carry the key.
      let result: boolean | undefined = false;
      for (const property of asNodes(node.properties)) {
        if (property.type === "SpreadElement") return undefined;
        if (propertyName(property) !== "trailingSlash") continue;
        const literal = asNode(property.value);
        result =
          property.type === "ObjectProperty" &&
          literal?.type === "BooleanLiteral" &&
          typeof literal.value === "boolean"
            ? literal.value
            : undefined;
      }
      return result;
    }
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression": {
      return trailingSlashOf(node.expression, bindings, depth + 1);
    }
    default: {
      return undefined;
    }
  }
}

function withTypedRoutesLocal(
  items: readonly { from: string; imported: string; local: string }[],
): string | undefined {
  return items.find(
    (item) =>
      item.from === "@paramour-js/next" && item.imported === "withTypedRoutes",
  )?.local;
}

/**
 * The binding a write lands on: an identifier, or `module.exports`. TS
 * wrappers are seen through, so `(config as NextConfig).x = …` counts.
 */
function writeTarget(value: unknown): string | undefined {
  let node = asNode(value);
  while (
    node?.type === "ParenthesizedExpression" ||
    node?.type === "TSAsExpression" ||
    node?.type === "TSNonNullExpression" ||
    node?.type === "TSSatisfiesExpression"
  ) {
    node = asNode(node.expression);
  }
  if (node?.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }
  return isModuleExports(node) ? MODULE_EXPORTS : undefined;
}

/**
 * Every binding the program writes after its declaration, which makes its
 * declared value an unreliable read: a direct property write or delete
 * (`c.x = …`, `c[k] = …`, `delete c.x`), an `Object.assign` /
 * `Object.defineProperty` / `Object.defineProperties` target, or a
 * reassignment (`c = …`, or `module.exports` assigned more than once). A
 * write to a nested object (`c.experimental.x = …`) is not counted, since it
 * cannot change `c.trailingSlash`. The whole program is searched, not just
 * the top level, because a static-export toggle usually sits under an `if`.
 * Scope is ignored, so a shadowing parameter of the same name also counts;
 * that errs toward unknown, which only costs a finding.
 */
function writtenBindings(program: AstNode): Set<string> {
  const written = new Set<string>();
  let moduleExportsAssignments = 0;
  const add = (target: string | undefined): void => {
    if (target !== undefined) written.add(target);
  };
  const visit = (node: AstNode): void => {
    if (node.type === "AssignmentExpression") {
      const left = asNode(node.left);
      // `module.exports` is itself a member expression: test it first.
      if (isModuleExports(left)) {
        moduleExportsAssignments += 1;
      } else if (left?.type === "MemberExpression") {
        add(writeTarget(left.object));
      } else {
        add(writeTarget(left));
      }
    } else if (node.type === "UnaryExpression" && node.operator === "delete") {
      const argument = asNode(node.argument);
      if (argument?.type === "MemberExpression") {
        add(writeTarget(argument.object));
      }
    } else if (node.type === "CallExpression") {
      const callee = asNode(node.callee);
      const object = asNode(callee?.object);
      const property = asNode(callee?.property);
      if (
        callee?.type === "MemberExpression" &&
        callee.computed !== true &&
        object?.type === "Identifier" &&
        object.name === "Object" &&
        property?.type === "Identifier" &&
        typeof property.name === "string" &&
        OBJECT_WRITERS.has(property.name)
      ) {
        add(writeTarget(asNodes(node.arguments)[0]));
      }
    }
    for (const child of Object.values(node)) {
      for (const item of Array.isArray(child) ? asNodes(child) : [child]) {
        const next = asNode(item);
        if (next !== undefined) visit(next);
      }
    }
  };
  visit(program);
  if (moduleExportsAssignments > 1) written.add(MODULE_EXPORTS);
  return written;
}
