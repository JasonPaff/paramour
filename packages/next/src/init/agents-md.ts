import { existsSync } from "node:fs";
import { join } from "node:path";

export const AGENTS_MARKER_START = "<!-- paramour:start -->";
export const AGENTS_MARKER_END = "<!-- paramour:end -->";

/**
 * @internal The marker-managed section init appends to an agent
 * instructions file. Install-dir-agnostic on purpose: the skill lands in
 * `.claude/`, `.cursor/`, or the portable `.agents/` depending on what
 * `detectTargets` found, and this snippet must stay true for all of them.
 */
export function agentsSnippet(): string {
  return [
    AGENTS_MARKER_START,
    "",
    "## paramour",
    "",
    "This project uses paramour for type-safe routing. The paramour agent",
    "skill (installed by `paramour skills` into detected agent-tool skills",
    "directories) documents codecs, route definitions, hooks, and the CLI —",
    "read it before route work.",
    "",
    "After changing routes: run `paramour generate`, verify with `paramour",
    "check` (exit 0 = artifact current), inspect shapes with `paramour list`,",
    "and commit `paramour-env.d.ts`.",
    "",
    AGENTS_MARKER_END,
  ].join("\n");
}

/**
 * @internal The instructions file the snippet goes into: AGENTS.md first
 * (the cross-tool convention), CLAUDE.md as the fallback, never both (tools
 * that read both would see duplicated content, and projects keeping both
 * usually mirror them — one marker-managed copy is the single source of
 * truth). Never creates a file: a root AGENTS.md is a `detectTargets`
 * detection signal, so init inventing one would change what the skills
 * step sees on the next run.
 */
export function findAgentsFile(projectRoot: string): string | undefined {
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const path = join(projectRoot, name);
    if (existsSync(path)) return path;
  }
  return undefined;
}

/**
 * @internal Add or refresh the marker-delimited paramour section. Pure
 * string→string (the `addPackageScript` pattern) so the write/dry-run
 * decision stays with the caller. Re-runs reconcile the section to the
 * current snippet — the markers exist precisely to delimit
 * paramour-managed content; prose outside them is never touched. A start
 * marker without an end marker is the one state left alone: repairing it
 * would mean guessing where the user's own text begins.
 */
export function upsertAgentsSection(text: string): {
  status: "added" | "unchanged" | "unterminated" | "updated";
  text: string;
} {
  const start = text.indexOf(AGENTS_MARKER_START);
  if (start === -1) {
    const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
    const separator = base === "" ? "" : "\n";
    return {
      status: "added",
      text: `${base}${separator}${agentsSnippet()}\n`,
    };
  }
  const end = text.indexOf(AGENTS_MARKER_END, start);
  if (end === -1) return { status: "unterminated", text };
  const current = text.slice(start, end + AGENTS_MARKER_END.length);
  const snippet = agentsSnippet();
  if (current === snippet) return { status: "unchanged", text };
  return {
    status: "updated",
    text:
      text.slice(0, start) +
      snippet +
      text.slice(end + AGENTS_MARKER_END.length),
  };
}
