import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { writeIfChanged } from "../emit.js";
import {
  hashContent,
  MANIFEST_FILENAME,
  readSkillManifest,
  renderManifest,
  type SkillManifest,
} from "./manifest.js";
import { type PackagedSkill } from "./packaged.js";
import { type SkillTarget } from "./targets.js";

/** One packaged file's audit against a target. */
export interface FileAudit {
  relPath: string;
  status: FileStatus;
}

/**
 * Per-file audit verdict, from three hashes: P (packaged), M (what the
 * manifest recorded at last sync, possibly absent), I (installed on disk).
 * - `fresh` — I equals P; nothing to do (identical unmanaged files are
 *   adopted rather than flagged).
 * - `missing` — no file on disk.
 * - `stale` — I equals M but M differs from P: untouched locally, the
 *   package moved on. Safe to overwrite.
 * - `modified` — local edits relative to the current package (M equals P but
 *   I differs, or no provenance at all). Never overwritten without --force.
 * - `stale-modified` — all three differ: local edits on an outdated base.
 *   Never overwritten without --force, but stale as far as `--check` cares.
 */
export type FileStatus =
  "fresh" | "missing" | "modified" | "stale" | "stale-modified";

/**
 * One human-readable detail line per file status, shared verbatim by
 * `skills --check`, doctor, and init's summary so every surface describes
 * the same state in the same words. `fresh` needs no line. Exhaustively
 * typed: a new FileStatus member fails to compile until it gets an entry.
 */
export const FILE_STATUS_DETAIL: Record<FileStatus, string | undefined> = {
  fresh: undefined,
  missing: "missing — run `paramour skills`",
  modified: "locally modified",
  stale: "packaged content changed — run `paramour skills`",
  "stale-modified":
    "locally modified on an outdated base — `paramour skills --force` overwrites",
};

/** A manifest entry whose file is no longer part of the packaged skill. */
export interface OrphanAudit {
  /**
   * True when the installed bytes still match the manifest record (or the
   * file is already gone) — provably ours and untouched, so sync may remove
   * it. False means local edits: sync leaves the file and stops tracking it.
   */
  managed: boolean;
  relPath: string;
}

/** Everything `--check`, doctor, and the installer need about one target. */
export interface TargetAudit {
  files: FileAudit[];
  manifest: SkillManifest | undefined;
  orphans: OrphanAudit[];
  target: SkillTarget;
}

/** What `syncTarget` did (or, under `dry`, would do) to one target. */
export interface TargetSyncResult {
  audit: TargetAudit;
  /** Unmanaged orphans left on disk, no longer tracked by the manifest. */
  keptOrphans: string[];
  /** Managed orphans removed from disk. */
  removedOrphans: string[];
  /** Files with local edits, left as-is because `force` was off. */
  skippedModified: string[];
  /** Files written (created or overwritten). */
  written: string[];
}

/** Audit one target without writing anything. */
export function auditTarget(
  target: SkillTarget,
  packaged: PackagedSkill,
): TargetAudit {
  const manifest = readSkillManifest(target.skillDir);
  const files = packaged.files.map((file): FileAudit => {
    const installedPath = join(target.skillDir, file.relPath);
    if (!existsSync(installedPath)) {
      return { relPath: file.relPath, status: "missing" };
    }
    const installed = hashContent(readFileSync(installedPath, "utf8"));
    const recorded = manifest?.files[file.relPath];
    const status: FileStatus =
      installed === file.hash
        ? "fresh"
        : recorded === undefined || recorded === file.hash
          ? "modified"
          : installed === recorded
            ? "stale"
            : "stale-modified";
    return { relPath: file.relPath, status };
  });
  const packagedPaths = new Set(packaged.files.map((file) => file.relPath));
  const orphans = Object.entries(manifest?.files ?? {})
    .filter(([relPath]) => !packagedPaths.has(relPath))
    .map(([relPath, recorded]): OrphanAudit => {
      const installedPath = join(target.skillDir, relPath);
      const managed =
        !existsSync(installedPath) ||
        hashContent(readFileSync(installedPath, "utf8")) === recorded;
      return { managed, relPath };
    });
  return { files, manifest, orphans, target };
}

/**
 * Whether a status means the installed copy no longer reflects the packaged
 * skill — the single classifier behind `skills --check` failures, doctor's
 * stale verdict, and init's summary line. `modified` is deliberate local
 * tailoring, not drift, so it does not count. The lookup is exhaustively
 * typed: a new FileStatus member fails to compile until it is classified.
 */
export function isOutdated(status: FileStatus): boolean {
  const outdated: Record<FileStatus, boolean> = {
    fresh: false,
    missing: true,
    modified: false,
    stale: true,
    "stale-modified": true,
  };
  return outdated[status];
}

/**
 * Install or re-sync one target: write missing/stale files, leave fresh
 * ones alone, refuse to overwrite local edits unless `force`, then rewrite
 * the manifest. Skipped modified files keep their previously recorded hash
 * so a later audit can still tell `stale-modified` from `modified`; orphans
 * are dropped from the manifest either way (a kept unmanaged orphan becomes
 * the user's file — reported once here, never nagged about again). One
 * exception to the manifest rewrite: when the target had no manifest,
 * nothing was written, and every packaged file was refused as locally
 * modified, no manifest is written either — that directory is the user's
 * own work and must not be adopted as paramour-managed.
 */
export function syncTarget(
  target: SkillTarget,
  packaged: PackagedSkill,
  options: { dry: boolean; force: boolean },
): TargetSyncResult {
  const audit = auditTarget(target, packaged);
  const statusOf = new Map(
    audit.files.map((file) => [file.relPath, file.status]),
  );
  const manifestFiles: Record<string, string> = {};
  const skippedModified: string[] = [];
  const written: string[] = [];
  for (const file of packaged.files) {
    const status = statusOf.get(file.relPath) ?? "missing";
    if (status === "fresh") {
      manifestFiles[file.relPath] = file.hash;
      continue;
    }
    if (
      (status === "modified" || status === "stale-modified") &&
      !options.force
    ) {
      skippedModified.push(file.relPath);
      const recorded = audit.manifest?.files[file.relPath];
      if (recorded !== undefined) manifestFiles[file.relPath] = recorded;
      continue;
    }
    if (!options.dry) {
      writeIfChanged(join(target.skillDir, file.relPath), file.content);
    }
    manifestFiles[file.relPath] = file.hash;
    written.push(file.relPath);
  }
  const keptOrphans: string[] = [];
  const removedOrphans: string[] = [];
  for (const orphan of audit.orphans) {
    if (orphan.managed) {
      if (!options.dry) {
        rmSync(join(target.skillDir, orphan.relPath), { force: true });
      }
      removedOrphans.push(orphan.relPath);
    } else {
      keptOrphans.push(orphan.relPath);
    }
  }
  // Writing the manifest is what marks a directory as paramour-managed. A
  // target with no prior manifest where nothing was written and every
  // packaged file was refused as locally modified is a hand-authored
  // directory that happens to share the path — dropping a manifest there
  // would adopt it and have doctor report local edits forever. Anything
  // written, any prior provenance, or an all-fresh byte-identical tree (the
  // designed adoption case) still rewrites the manifest.
  const wouldAdoptUserDir =
    audit.manifest === undefined &&
    skippedModified.length > 0 &&
    written.length === 0;
  if (!options.dry && !wouldAdoptUserDir) {
    writeIfChanged(
      join(target.skillDir, MANIFEST_FILENAME),
      renderManifest({
        files: manifestFiles,
        skill: "paramour",
        version: packaged.version,
      }),
    );
  }
  return { audit, keptOrphans, removedOrphans, skippedModified, written };
}
