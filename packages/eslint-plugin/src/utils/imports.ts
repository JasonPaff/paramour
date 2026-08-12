import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

import { AST_NODE_TYPES, ASTUtils } from "@typescript-eslint/utils";

export interface ImportBinding {
  imported: string;
  source: string;
}

/**
 * Resolves a variable definition to the import specifier it binds, if any.
 * Type-only imports are treated as no binding — a value usage of one is
 * already a TS error, and flagging it here would be noise on top.
 */
export function getImportBinding(
  def: TSESLint.Scope.Definition | undefined,
): ImportBinding | null {
  if (!def) return null;
  const specifier = def.node;
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    if (specifier.parent.importKind === "type") return null;
    return { imported: "default", source: specifier.parent.source.value };
  }
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
    if (specifier.parent.importKind === "type") return null;
    return { imported: "*", source: specifier.parent.source.value };
  }
  if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
    if (specifier.parent.type !== AST_NODE_TYPES.ImportDeclaration) return null;
    if (
      specifier.importKind === "type" ||
      specifier.parent.importKind === "type"
    )
      return null;
    const { imported } = specifier;
    return {
      imported:
        imported.type === AST_NODE_TYPES.Identifier
          ? imported.name
          : imported.value,
      source: specifier.parent.source.value,
    };
  }
  return null;
}

/**
 * Resolves a call's callee to the import it binds: an identifier callee
 * (named/aliased/default import) or the non-computed namespace member form
 * (ns.name). Returns null for anything else, including a bare call of a
 * namespace object itself.
 */
export function getImportedCallee(
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
): ImportBinding | null {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const binding = getImportBinding(
      resolveDef(sourceCode, callee, callee.name),
    );
    if (!binding || binding.imported === "*") return null;
    return binding;
  }
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  )
    return null;
  const binding = getImportBinding(
    resolveDef(sourceCode, callee.object, callee.object.name),
  );
  if (binding?.imported !== "*") return null;
  return { imported: callee.property.name, source: binding.source };
}

/**
 * True when the expression is a call of `imported` from one of `sources`, in
 * either the identifier or the namespace-member callee form.
 */
export function isImportedCall(
  sourceCode: TSESLint.SourceCode,
  expr: null | TSESTree.Expression | undefined,
  imported: string,
  sources: readonly string[],
): boolean {
  if (expr?.type !== AST_NODE_TYPES.CallExpression) return false;
  const binding = getImportedCallee(sourceCode, expr);
  return binding?.imported === imported && sources.includes(binding.source);
}

/** Finds the first definition of `name` in scope at `node`. */
export function resolveDef(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
  name: string,
): TSESLint.Scope.Definition | undefined {
  return ASTUtils.findVariable(sourceCode.getScope(node), name)?.defs[0];
}

/**
 * Module-source match that also accepts the extensionful spelling nodenext
 * resolution users write ("next/router.js" for "next/router").
 */
export function sourceMatches(actual: string, expected: string): boolean {
  return actual === expected || actual === `${expected}.js`;
}
