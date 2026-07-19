import { type AnyCodec, type Codec, p, type SearchConfig } from "paramour";
// parseValue is the sanctioned raw-parse probe for reflection-driven tooling
// (the same entry the devtools panel uses); the explorer qualifies — it turns
// descriptor wire strings into typed modifier values through the described
// codec itself, never a second value syntax (plan-docs-milestone-5 B1).
import { parseValue } from "paramour/internal";
import { z } from "zod";

import { messageOf, show } from "@/lib/show-value";

import {
  type ElementDescriptor,
  type ElementScalarKind,
  type KeyDescriptor,
  type PresenceDescriptor,
} from "./descriptor";

/**
 * A descriptor that passed the zod schema but cannot become a legal config —
 * duplicate names, empty names, wire strings the codec rejects. Thrown
 * loudly and rendered in the UI as the error it is: a malformed shared link
 * is itself a wire-format demo (plan-docs-milestone-5 B2).
 */
export class ExplorerConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExplorerConfigError";
  }
}

/**
 * The permissive canned schema behind the `json` picker kind: any JSON value.
 */
const anyJson = z.json();

const SCALAR_BUILDERS: Record<"json" | ElementScalarKind, () => AnyCodec> = {
  boolean: () => p.boolean(),
  index: () => p.index(),
  integer: () => p.integer(),
  isoDate: () => p.isoDate(),
  json: () => p.json(anyJson),
  number: () => p.number(),
  string: () => p.string(),
  timestamp: () => p.timestamp(),
};

/**
 * Maps the URL descriptor to a real `SearchConfig` of `p.*` codecs with
 * modifiers applied — the explorer always exercises the shipped library,
 * never a re-implementation.
 */
export function buildSearchConfig(
  keys: readonly KeyDescriptor[],
): SearchConfig {
  const config: SearchConfig = {};
  for (const key of keys) {
    if (key.name === "") {
      throw new ExplorerConfigError("every key needs a name");
    }
    if (Object.hasOwn(config, key.name)) {
      throw new ExplorerConfigError(
        `duplicate key "${key.name}" — search param names must be unique`,
      );
    }
    config[key.name] = buildCodec(key);
  }
  return config;
}

/**
 * The equivalent `route.def.ts` source for the composed config — rendered by
 * the composer so every UI state shows the real `p.*` chain it stands for.
 */
export function describeConfigSource(keys: readonly KeyDescriptor[]): string {
  if (keys.length === 0) return "search: {}";
  const lines = keys.map(
    (key) => `  ${showKey(key.name)}: ${describeKey(key)},`,
  );
  return `search: {\n${lines.join("\n")}\n}`;
}

/**
 * Applies presence and catch modifiers to a freshly built arity-"single"
 * codec, parsing the stored wire forms through the codec itself. Order
 * mirrors the type-state grammar: presence first (only legal on a required
 * codec), then `.catch()` (legal anywhere, once).
 */
function applyModifiers(
  base: AnyCodec,
  key: {
    catch?: string | undefined;
    name: string;
    presence: PresenceDescriptor;
  },
): AnyCodec {
  let codec = base;
  if (key.presence === "optional") {
    codec = codec.optional();
  } else if (typeof key.presence === "object") {
    codec = codec.default(
      parseWire(base, key.presence.default, `.default() for "${key.name}"`),
    );
  }
  if (key.catch !== undefined) {
    codec = codec.catch(
      parseWire(base, key.catch, `.catch() for "${key.name}"`),
    );
  }
  return codec;
}

function buildCodec(key: KeyDescriptor): AnyCodec {
  switch (key.kind) {
    case "array": {
      const element = buildElementCodec(key.element);
      // The cast narrows AnyCodec's union type-state to the exact shape the
      // list builders accept; resolveListElement re-checks it at runtime.
      let codec: AnyCodec = p.array(element as Codec<unknown>);
      if (key.catch !== undefined) {
        // An array's wire form is a list of per-key values, so its .catch()
        // fallback is stored as element wire forms, each parsed through the
        // element codec.
        codec = codec.catch(
          key.catch.map((raw, index) =>
            parseWire(
              element,
              raw,
              `.catch() element ${String(index)} for "${key.name}"`,
            ),
          ),
        );
      }
      return codec;
    }
    case "csv":
      return applyModifiers(
        p.csv(buildElementCodec(key.element) as Codec<unknown>),
        key,
      );
    case "enum":
      return applyModifiers(p.enum(requireMembers(key.members)), key);
    default:
      return applyModifiers(SCALAR_BUILDERS[key.kind](), key);
  }
}

function buildElementCodec(element: ElementDescriptor): AnyCodec {
  if (element.kind === "enum") {
    return p.enum(requireMembers(element.members));
  }
  return SCALAR_BUILDERS[element.kind]();
}

function describeElementSource(element: ElementDescriptor): string {
  if (element.kind === "enum") {
    return `p.enum(${show(element.members)})`;
  }
  // p.array()/p.csv() default their element to p.string() — show the
  // canonical spelling.
  return element.kind === "string" ? "" : `p.${element.kind}()`;
}

function describeKey(key: KeyDescriptor): string {
  switch (key.kind) {
    case "array": {
      const element = buildElementCodec(key.element);
      let source = `p.array(${describeElementSource(key.element)})`;
      if (key.catch !== undefined) {
        const fallback = key.catch.map((raw) => parseValue(element, raw));
        source += `.catch(${show(fallback)})`;
      }
      return source;
    }
    case "csv":
      return describeModifierSource(
        p.csv(buildElementCodec(key.element) as Codec<unknown>),
        key,
        `p.csv(${describeElementSource(key.element)})`,
      );
    case "enum":
      return describeModifierSource(
        p.enum(requireMembers(key.members)),
        key,
        `p.enum(${show(key.members)})`,
      );
    case "json":
      return describeModifierSource(
        SCALAR_BUILDERS.json(),
        key,
        "p.json(z.json())",
      );
    default:
      return describeModifierSource(
        SCALAR_BUILDERS[key.kind](),
        key,
        `p.${key.kind}()`,
      );
  }
}

function describeModifierSource(
  base: AnyCodec,
  key: { catch?: string | undefined; presence: PresenceDescriptor },
  source: string,
): string {
  let described = source;
  if (key.presence === "optional") {
    described += ".optional()";
  } else if (typeof key.presence === "object") {
    described += `.default(${show(parseValue(base, key.presence.default))})`;
  }
  if (key.catch !== undefined) {
    described += `.catch(${show(parseValue(base, key.catch))})`;
  }
  return described;
}

function parseWire(codec: AnyCodec, raw: string, site: string): unknown {
  try {
    return parseValue(codec, raw);
  } catch (error) {
    throw new ExplorerConfigError(`${site}: ${messageOf(error)}`, {
      cause: error,
    });
  }
}

/** Re-narrows zod's `string[]` to `p.enum`'s non-empty tuple contract. */
function requireMembers(members: readonly string[]): [string, ...string[]] {
  const [first, ...rest] = members;
  if (first === undefined) {
    throw new ExplorerConfigError("an enum needs at least one member");
  }
  return [first, ...rest];
}

function showKey(key: string): string {
  return /^[$A-Z_a-z][$\w]*$/.test(key) ? key : JSON.stringify(key);
}
