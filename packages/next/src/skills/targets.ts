import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** One resolved install destination. */
export interface SkillTarget {
  /** POSIX display path, e.g. `.claude/skills/paramour`. */
  rel: string;
  /** Absolute path to the skill's install directory. */
  skillDir: string;
  tool: ToolId;
}

/** The agent tools the installer knows how to target. */
export type ToolId = "agents" | "claude" | "codex" | "cursor";

// Detection is directory presence only — no config parsing. Per-tool config
// formats move monthly; the dot-directory at the project root is the one
// signal that has stayed stable across the ecosystem. `agents` additionally
// matches an AGENTS.md file, the portable convention's sibling marker.
const TOOLS: Record<
  ToolId,
  { detect: (projectRoot: string) => boolean; dir: string }
> = {
  agents: {
    detect: (root) =>
      isDirectory(join(root, ".agents")) || existsSync(join(root, "AGENTS.md")),
    dir: ".agents",
  },
  claude: {
    detect: (root) => isDirectory(join(root, ".claude")),
    dir: ".claude",
  },
  codex: { detect: (root) => isDirectory(join(root, ".codex")), dir: ".codex" },
  cursor: {
    detect: (root) => isDirectory(join(root, ".cursor")),
    dir: ".cursor",
  },
};

export const TOOL_IDS = Object.keys(TOOLS) as readonly ToolId[];

/** `resolveTargets` result when the inputs were valid. */
export interface ResolvedTargets {
  /** True when nothing was detected and the portable location was chosen. */
  fallback: boolean;
  targets: SkillTarget[];
}

/** Targets whose tool is present in the project, alphabetical by tool. */
export function detectTargets(projectRoot: string): SkillTarget[] {
  return TOOL_IDS.filter((tool) => TOOLS[tool].detect(projectRoot)).map(
    (tool) => toTarget(projectRoot, tool),
  );
}

/**
 * Resolve install destinations: explicit `--tool` values (repeatable and
 * comma-splittable) override detection entirely; otherwise every detected
 * tool is targeted; with nothing detected the portable `.agents/skills/`
 * location is the fallback so a bare `paramour skills` always installs
 * somewhere tools can find.
 */
export function resolveTargets(
  projectRoot: string,
  toolFlags: readonly string[] | undefined,
): ResolvedTargets | { error: string } {
  const requested = (toolFlags ?? [])
    .flatMap((flag) => flag.split(","))
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (requested.length > 0) {
    for (const id of requested) {
      if (!TOOL_IDS.includes(id as ToolId)) {
        return {
          error: `unknown --tool "${id}" (expected one of: ${TOOL_IDS.join(", ")})`,
        };
      }
    }
    const unique = TOOL_IDS.filter((tool) =>
      requested.includes(tool),
    ); /* dedupes and restores alphabetical order */
    return {
      fallback: false,
      targets: unique.map((tool) => toTarget(projectRoot, tool)),
    };
  }
  const detected = detectTargets(projectRoot);
  if (detected.length > 0) return { fallback: false, targets: detected };
  return { fallback: true, targets: [toTarget(projectRoot, "agents")] };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function toTarget(projectRoot: string, tool: ToolId): SkillTarget {
  const { dir } = TOOLS[tool];
  return {
    rel: `${dir}/skills/paramour`,
    skillDir: join(projectRoot, dir, "skills", "paramour"),
    tool,
  };
}
