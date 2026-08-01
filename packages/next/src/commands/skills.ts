import { parseCommandFlags } from "../cli-args.js";
import { type CliIo, message, resolveIo } from "../cli-io.js";
import { loadPackagedSkill, type PackagedSkill } from "../skills/packaged.js";
import {
  auditTarget,
  FILE_STATUS_DETAIL,
  isOutdated,
  syncTarget,
  type TargetAudit,
  type TargetSyncResult,
} from "../skills/sync.js";
import { resolveTargets, type SkillTarget } from "../skills/targets.js";

const USAGE = [
  "Usage: paramour skills [options]",
  "",
  "Install the bundled Paramour agent skill into each detected agent tool's",
  "skills directory (.agents/, .claude/, .codex/, .cursor/), stamping every",
  "install with a .paramour-skills.json manifest so re-syncs are safe:",
  "locally-modified files are never overwritten without --force. With no",
  "tools detected, installs to the portable .agents/skills/.",
  "",
  "Exit codes: 0 success (including skipped local edits), 1 under --check",
  "when any installed copy is missing or stale, 2 usage/operational errors.",
  "",
  "Options:",
  "  --check      verify installed skills instead of writing; exit 1 when",
  "               any copy is missing or stale; passes with nothing to",
  "               check when no agent tooling is detected",
  "  --dry-run    report what would be written without writing",
  "  --force      overwrite locally-modified skill files",
  "  --help, -h   show this help",
  "  --json       machine-readable output",
  "  --tool <t>   target tool(s): agents, claude, codex, cursor",
  "               (repeatable or comma-separated; overrides detection)",
].join("\n");

/**
 * @internal Per-orphan reporting for a sync: removals (deletions are the one
 * thing a sync does that must never happen silently) and kept locally-modified
 * orphans. Shared by `paramour skills` and `paramour init` so the two commands
 * describe the same operation in the same words.
 */
export function reportOrphans(
  result: TargetSyncResult,
  dry: boolean,
  stdout: (line: string) => void,
): void {
  for (const orphan of result.removedOrphans) {
    stdout(
      `      ${dry ? "would remove" : "removed"} ${orphan} — no longer part of the skill`,
    );
  }
  for (const orphan of result.keptOrphans) {
    stdout(
      `      left ${orphan} — locally modified and no longer part of the skill`,
    );
  }
}

/**
 * @internal `paramour skills` — the installer for the bundled agent skill.
 * `--check` follows `check`'s exit class: 1 means "the installed copies do
 * not reflect the installed package". A plain run treats refusing to clobber
 * local edits as success (init's manual-fallback precedent): the refusal is
 * printed, the fix (`--force`) is named, and nothing is broken.
 */
export function runSkills(argv: readonly string[], io: CliIo): number {
  const { stderr, stdout } = resolveIo(io);
  const parsed = parseCommandFlags(
    argv,
    {
      check: { default: false, type: "boolean" },
      "dry-run": { default: false, type: "boolean" },
      force: { default: false, type: "boolean" },
      help: { default: false, short: "h", type: "boolean" },
      json: { default: false, type: "boolean" },
      tool: { multiple: true, type: "string" },
    },
    USAGE,
    { stderr, stdout },
  );
  if ("exit" in parsed) return parsed.exit;
  const flags = parsed.values;

  // --check never writes, so a write-shaping flag alongside it is a
  // contradiction, not a no-op — reject loudly.
  for (const conflicting of ["dry-run", "force"] as const) {
    if (flags.check && flags[conflicting]) {
      stderr(`paramour: --check cannot be combined with --${conflicting}`);
      stderr(USAGE);
      return 2;
    }
  }

  const projectRoot = process.cwd();
  const resolved = resolveTargets(projectRoot, flags.tool);
  if ("error" in resolved) {
    stderr(`paramour: ${resolved.error}`);
    stderr(USAGE);
    return 2;
  }

  let packaged: PackagedSkill;
  try {
    packaged = loadPackagedSkill();
  } catch (error) {
    stderr(`paramour: bundled skill content unreadable: ${message(error)}`);
    return 2;
  }

  try {
    return flags.check
      ? runCheck(
          resolved.targets,
          packaged,
          { fallback: resolved.fallback, json: flags.json },
          stdout,
        )
      : runInstall(
          resolved.targets,
          packaged,
          {
            dry: flags["dry-run"],
            fallback: resolved.fallback,
            force: flags.force,
            json: flags.json,
          },
          stdout,
        );
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }
}

/** Target-level `--check` verdict, doctor's status vocabulary. */
function checkStatus(audit: TargetAudit): "fail" | "pass" | "warn" {
  const statuses = audit.files.map((file) => file.status);
  if (statuses.some(isOutdated)) return "fail";
  return statuses.some((status) => status === "modified") ? "warn" : "pass";
}

function reportInstall(
  result: TargetSyncResult,
  dry: boolean,
  stdout: (line: string) => void,
): void {
  const { rel } = result.audit.target;
  const freshInstall = result.audit.manifest === undefined;
  if (result.written.length > 0) {
    const verb = dry
      ? freshInstall
        ? "would install"
        : "would update"
      : freshInstall
        ? "installed"
        : "updated";
    const count = `${String(result.written.length)} file${result.written.length === 1 ? "" : "s"}`;
    stdout(`  ✔ ${rel} — ${verb} ${freshInstall ? `(${count})` : count}`);
    if (!freshInstall) stdout(`      ${result.written.join(", ")}`);
  } else if (result.skippedModified.length === 0) {
    stdout(`  • ${rel} — up to date`);
  }
  if (result.skippedModified.length > 0) {
    const count = result.skippedModified.length;
    stdout(
      `  ⚠ ${rel} — ${String(count)} locally-modified file${count === 1 ? "" : "s"} left as-is (--force overwrites)`,
    );
    stdout(`      ${result.skippedModified.join(", ")}`);
  }
  reportOrphans(result, dry, stdout);
}

function runCheck(
  targets: readonly SkillTarget[],
  packaged: PackagedSkill,
  options: { fallback: boolean; json: boolean },
  stdout: (line: string) => void,
): number {
  // --check's verdict is about the detection result. With no agent tooling
  // detected (and no explicit --tool), the only "target" is the invented
  // portable fallback a bare install would use — a location this project
  // never opted into, so auditing it can only ever fail. There is nothing
  // to check, and nothing to check is a pass.
  if (options.fallback) {
    if (options.json) {
      stdout(
        JSON.stringify(
          { fallback: true, status: "pass", targets: [] },
          null,
          2,
        ),
      );
    } else {
      stdout("  • no agent tooling detected — nothing to check");
    }
    return 0;
  }

  const audits = targets.map((target) => auditTarget(target, packaged));
  const verdicts = audits.map(checkStatus);
  const failed = verdicts.filter((verdict) => verdict === "fail").length;
  const warned = verdicts.filter((verdict) => verdict === "warn").length;
  const status = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";

  if (options.json) {
    stdout(
      JSON.stringify(
        {
          fallback: false,
          status,
          targets: audits.map((audit) => ({
            files: audit.files,
            rel: audit.target.rel,
            tool: audit.target.tool,
          })),
        },
        null,
        2,
      ),
    );
    return failed > 0 ? 1 : 0;
  }

  const marks = { fail: "✖", pass: "✔", warn: "⚠" } as const;
  for (const [index, audit] of audits.entries()) {
    const verdict = verdicts[index] ?? "pass";
    const label =
      verdict === "pass"
        ? "up to date"
        : verdict === "warn"
          ? "locally modified"
          : audit.files.every((file) => file.status === "missing")
            ? "not installed (run `paramour skills`)"
            : "stale (run `paramour skills`)";
    stdout(`  ${marks[verdict]} ${audit.target.rel} — ${label}`);
    for (const file of audit.files) {
      const detail = FILE_STATUS_DETAIL[file.status];
      if (detail !== undefined) stdout(`      ${file.relPath}: ${detail}`);
    }
  }
  stdout("");
  stdout(
    `skills: ${String(audits.length)} target${audits.length === 1 ? "" : "s"} — ${String(failed)} stale, ${String(warned)} modified`,
  );
  return failed > 0 ? 1 : 0;
}

function runInstall(
  targets: readonly SkillTarget[],
  packaged: PackagedSkill,
  options: { dry: boolean; fallback: boolean; force: boolean; json: boolean },
  stdout: (line: string) => void,
): number {
  const results = targets.map((target) =>
    syncTarget(target, packaged, { dry: options.dry, force: options.force }),
  );

  if (options.json) {
    stdout(
      JSON.stringify(
        {
          dry: options.dry,
          fallback: options.fallback,
          status: results.some((result) => result.skippedModified.length > 0)
            ? "warn"
            : "ok",
          targets: results.map((result) => ({
            keptOrphans: result.keptOrphans,
            rel: result.audit.target.rel,
            removedOrphans: result.removedOrphans,
            skippedModified: result.skippedModified,
            tool: result.audit.target.tool,
            written: result.written,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  stdout(
    options.dry
      ? "paramour skills (dry run — nothing written)"
      : "paramour skills",
  );
  if (options.fallback) {
    stdout(
      "  → no agent tooling detected — installing to the portable .agents/skills/",
    );
  }
  for (const result of results) reportInstall(result, options.dry, stdout);
  return 0;
}
