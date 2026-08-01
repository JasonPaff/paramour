import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

/**
 * The sidecar stamp `paramour skills` writes next to every installed copy.
 * It lives inside the installed skill directory (not at the project root) so
 * deleting a tool directory is a clean uninstall — no orphaned record keeps
 * reporting the skill as missing after a deliberate removal. Skill loaders
 * ignore dotfiles under progressive disclosure, so the installed skill files
 * themselves stay byte-identical to the published ones.
 */
export interface SkillManifest {
  /** POSIX-relative path → `sha256:<hex>` of the content last synced. */
  files: Record<string, string>;
  skill: "paramour";
  /**
   * The `@paramour-js/next` version that last wrote this manifest.
   * Informational only: staleness truth is always hash comparison, so a
   * version bump without content changes never reads as stale.
   */
  version: string;
}

export const MANIFEST_FILENAME = ".paramour-skills.json";

/**
 * CRLF-normalized sha256. Normalizing before hashing makes every status
 * computation immune to a consumer repo's git `autocrlf` rewriting the
 * installed markdown on checkout — a line-ending flip is not a content edit.
 */
export function hashContent(text: string): string {
  const digest = createHash("sha256")
    .update(text.replaceAll("\r\n", "\n"))
    .digest("hex");
  return `sha256:${digest}`;
}

/**
 * Read a target's manifest; `undefined` when absent or malformed. A corrupt
 * manifest degrades to "no provenance": byte-identical files still audit as
 * fresh and anything else audits as locally modified, which the installer
 * refuses to overwrite without `--force` — the safe direction. A manifest
 * containing any file key that could escape the skill directory is treated
 * as corrupt the same way, since those keys become deletion paths in sync.
 */
export function readSkillManifest(skillDir: string): SkillManifest | undefined {
  const path = join(skillDir, MANIFEST_FILENAME);
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  // Fields typed unknown, not Partial<SkillManifest> — the JSON is
  // arbitrary bytes, and asserting the target shape up front would make
  // these guards type-narrow the wrong way.
  const candidate = parsed as {
    files?: unknown;
    skill?: unknown;
    version?: unknown;
  };
  if (candidate.skill !== "paramour") return undefined;
  if (typeof candidate.version !== "string") return undefined;
  const files = candidate.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) {
    return undefined;
  }
  for (const [key, value] of Object.entries(files)) {
    if (!isSafeManifestKey(key, skillDir)) return undefined;
    if (typeof value !== "string") return undefined;
  }
  return {
    files: files as Record<string, string>,
    skill: "paramour",
    version: candidate.version,
  };
}

/**
 * Deterministic serialization: sorted file keys, two-space indent, LF,
 * trailing newline, no timestamps — same doctrine as the generated artifact,
 * so a re-run that changes nothing writes nothing.
 */
export function renderManifest(manifest: SkillManifest): string {
  // Byte-order comparison, not localeCompare — locale collation varies by
  // machine, and this file must be byte-identical wherever it is written.
  const files = Object.fromEntries(
    Object.entries(manifest.files).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
  const ordered: SkillManifest = {
    files,
    skill: manifest.skill,
    version: manifest.version,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Manifest keys are joined onto the skill directory and fed to the
 * filesystem during sync — orphan removal in particular deletes the path a
 * key names — so a tampered key like `"../../../src/index.ts"` would reach
 * files far outside the install. Only a plain relative POSIX path that
 * resolves strictly inside the skill directory is acceptable: no empty
 * keys, no backslashes, no absolute paths (POSIX, Windows drive, or UNC),
 * and the resolved path must sit under `resolve(skillDir)` followed by a
 * separator so a sibling directory sharing the prefix does not slip
 * through.
 */
function isSafeManifestKey(key: string, skillDir: string): boolean {
  if (key === "" || key.includes("\\")) return false;
  if (isAbsolute(key) || key.startsWith("/") || /^[A-Za-z]:/.test(key)) {
    return false;
  }
  return resolve(skillDir, key).startsWith(resolve(skillDir) + sep);
}
