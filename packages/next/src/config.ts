import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shape of `paramour.config.{ts,mjs,json}` (§7.2 / TR7) — the CLI's config
 * file. Every field is optional; the CLI's precedence is flags → this file →
 * inference. `.ts`/`.mjs` files default-export this object.
 */
export interface ParamourConfig {
  /** App dir, relative to the project root; default: TR2 discovery. */
  appDir?: string;
  /** Artifact path, relative to the project root (TR3 escape hatch). */
  outFile?: string;
  /** Page extensions, no leading dot; default: Next's four. */
  pageExtensions?: string[];
}

/** @internal Discovery order at the project root (TR7) — first match wins. */
export const CONFIG_FILE_NAMES = [
  "paramour.config.ts",
  "paramour.config.mjs",
  "paramour.config.json",
] as const;

/**
 * @internal Load and validate the project's config file, or `undefined`
 * when none exists. No upward traversal — the documented contract is three
 * filenames at the project root (TR7). jiti (the §7.2 loader carry-over) is
 * imported dynamically so only CLI runs that actually have a `.ts`/`.mjs`
 * config pay for it; `withTypedRoutes` users never execute it.
 */
export async function loadConfigFile(
  projectRoot: string,
): Promise<undefined | { config: ParamourConfig; path: string }> {
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(projectRoot, name);
    if (!existsSync(path)) continue;
    if (name.endsWith(".json")) {
      const text = readFileSync(path, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        // Name the file: a bare SyntaxError("Unexpected token …") gives the
        // user nothing to grep for.
        throw new Error(
          `${name}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      return { config: validateConfig(parsed, name), path };
    }
    const { createJiti } = await import("jiti");
    // fsCache off: config files are tiny and user projects shouldn't grow
    // a transform cache just because the CLI ran.
    const jiti = createJiti(import.meta.url, {
      fsCache: false,
      interopDefault: true,
    });
    const mod: unknown = await jiti.import(path);
    const value =
      typeof mod === "object" && mod !== null && "default" in mod
        ? mod.default
        : mod;
    return { config: validateConfig(value, name), path };
  }
  return undefined;
}

/**
 * Hand-rolled validation: a 3-key schema can afford to reject unknown keys —
 * a silently ignored `pagesExtensions` typo is exactly the footgun this
 * prevents. Throws with the file and key named; the CLI maps it to exit 2.
 */
function validateConfig(value: unknown, sourceName: string): ParamourConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${sourceName} must export a config object`);
  }
  const config: ParamourConfig = {};
  for (const [key, entry] of Object.entries(value)) {
    switch (key) {
      case "appDir":
      case "outFile": {
        if (typeof entry !== "string" || entry === "") {
          throw new Error(
            `${sourceName}: \`${key}\` must be a non-empty string`,
          );
        }
        config[key] = entry;
        break;
      }
      case "pageExtensions": {
        if (
          !Array.isArray(entry) ||
          entry.length === 0 ||
          !entry.every(
            (ext): ext is string => typeof ext === "string" && ext !== "",
          )
        ) {
          throw new Error(
            `${sourceName}: \`pageExtensions\` must be a non-empty array of non-empty strings`,
          );
        }
        // A leading dot silently matches nothing (`page..tsx` never exists) —
        // exactly the class of typo this hand-rolled validation exists for.
        const dotted = entry.find((ext) => ext.startsWith("."));
        if (dotted !== undefined) {
          throw new Error(
            `${sourceName}: \`pageExtensions\` entries must not start with a dot: "${dotted}"`,
          );
        }
        config.pageExtensions = entry;
        break;
      }
      default:
        throw new Error(`${sourceName}: unknown key \`${key}\``);
    }
  }
  return config;
}
