import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/run-cli.js";
import {
  hashContent,
  MANIFEST_FILENAME,
  readSkillManifest,
  renderManifest,
} from "../src/skills/manifest.js";
import {
  loadPackagedSkill,
  type PackagedSkill,
} from "../src/skills/packaged.js";
import { auditTarget, syncTarget } from "../src/skills/sync.js";
import {
  detectTargets,
  resolveTargets,
  type SkillTarget,
} from "../src/skills/targets.js";
import { makeTempDir, makeTree } from "./helpers.js";

const originalCwd = process.cwd();
afterEach(() => {
  process.chdir(originalCwd);
});

function claudeTarget(root: string): SkillTarget {
  return {
    rel: ".claude/skills/paramour",
    skillDir: join(root, ".claude", "skills", "paramour"),
    tool: "claude",
  };
}

/** A one-file fake skill so audit cases control every hash exactly. */
function fakeSkill(content = "packaged\n"): PackagedSkill {
  return {
    files: [{ content, hash: hashContent(content), relPath: "SKILL.md" }],
    version: "9.9.9",
  };
}

async function skills(
  argv: readonly string[] = [],
): Promise<{ code: number; err: string[]; out: string[] }> {
  const err: string[] = [];
  const out: string[] = [];
  const code = await runCli(["skills", ...argv], {
    stderr: (line) => {
      err.push(line);
    },
    stdout: (line) => {
      out.push(line);
    },
  });
  return { code, err, out };
}

/** Every file under root as path → content, for byte-identical assertions. */
function snapshotTree(root: string, dir = root): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      Object.assign(snapshot, snapshotTree(root, abs));
    } else {
      snapshot[abs] = readFileSync(abs, "utf8");
    }
  }
  return snapshot;
}

function write(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function writeManifest(
  root: string,
  files: Record<string, string>,
  version = "1.0.0",
): void {
  write(
    root,
    `.claude/skills/paramour/${MANIFEST_FILENAME}`,
    renderManifest({ files, skill: "paramour", version }),
  );
}

describe("skills targets", () => {
  it("detects each tool directory and AGENTS.md, alphabetically", () => {
    const root = makeTempDir();
    makeTree(root, [".cursor/", ".claude/"]);
    expect(detectTargets(root).map((target) => target.tool)).toEqual([
      "claude",
      "cursor",
    ]);
    write(root, "AGENTS.md", "# agents\n");
    expect(detectTargets(root).map((target) => target.tool)).toEqual([
      "agents",
      "claude",
      "cursor",
    ]);
  });

  it("a root AGENTS.md alone, with no dot-directories, detects agents", () => {
    const root = makeTempDir();
    write(root, "AGENTS.md", "# agents\n");
    expect(detectTargets(root).map((target) => target.tool)).toEqual([
      "agents",
    ]);
  });

  it("a file named like a tool directory does not count", () => {
    const root = makeTempDir();
    write(root, ".claude", "not a directory");
    expect(detectTargets(root)).toEqual([]);
  });

  it("--tool values override detection, split on commas, and dedupe", () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    const resolved = resolveTargets(root, ["cursor,codex", "codex"]);
    if ("error" in resolved) throw new Error(resolved.error);
    expect(resolved.fallback).toBe(false);
    expect(resolved.targets.map((target) => target.tool)).toEqual([
      "codex",
      "cursor",
    ]);
  });

  it("rejects an unknown --tool value", () => {
    const resolved = resolveTargets(makeTempDir(), ["copilot"]);
    expect(resolved).toEqual({
      error: `unknown --tool "copilot" (expected one of: agents, claude, codex, cursor)`,
    });
  });

  it("falls back to the portable location when nothing is detected", () => {
    const root = makeTempDir();
    const resolved = resolveTargets(root, undefined);
    if ("error" in resolved) throw new Error(resolved.error);
    expect(resolved.fallback).toBe(true);
    expect(resolved.targets.map((target) => target.rel)).toEqual([
      ".agents/skills/paramour",
    ]);
  });
});

describe("skills manifest", () => {
  it("hashContent normalizes CRLF to LF before hashing", () => {
    expect(hashContent("a\r\nb\r\n")).toBe(hashContent("a\nb\n"));
    expect(hashContent("a\nb\n")).not.toBe(hashContent("a\nc\n"));
  });

  it("renderManifest is deterministic with sorted file keys", () => {
    const rendered = renderManifest({
      files: { "a.md": "sha256:1", "b.md": "sha256:2" },
      skill: "paramour",
      version: "1.0.0",
    });
    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered.indexOf('"a.md"')).toBeLessThan(rendered.indexOf('"b.md"'));
    expect(rendered).not.toContain("\r");
  });

  it("readSkillManifest returns undefined for absent or malformed files", () => {
    const root = makeTempDir();
    const skillDir = join(root, ".claude", "skills", "paramour");
    expect(readSkillManifest(skillDir)).toBeUndefined();
    write(root, `.claude/skills/paramour/${MANIFEST_FILENAME}`, "not json");
    expect(readSkillManifest(skillDir)).toBeUndefined();
    write(
      root,
      `.claude/skills/paramour/${MANIFEST_FILENAME}`,
      `{ "skill": "other", "version": "1.0.0", "files": {} }`,
    );
    expect(readSkillManifest(skillDir)).toBeUndefined();
  });

  it("readSkillManifest rejects keys that could escape the skill directory", () => {
    const root = makeTempDir();
    const skillDir = join(root, ".claude", "skills", "paramour");
    for (const key of [
      "",
      "../../../src/index.ts",
      "../paramour-evil/SKILL.md",
      "/etc/passwd",
      "C:/temp/evil.md",
      "\\\\server\\share\\evil.md",
      "references\\evil.md",
    ]) {
      writeManifest(root, { [key]: "sha256:0" });
      expect(readSkillManifest(skillDir)).toBeUndefined();
    }
    // Sanity: an ordinary nested relative key keeps the manifest readable.
    writeManifest(root, { "references/fine.md": "sha256:0" });
    expect(readSkillManifest(skillDir)?.files).toEqual({
      "references/fine.md": "sha256:0",
    });
  });
});

describe("skills audit", () => {
  it("classifies every file status from the P/M/I hash triple", () => {
    const packaged = fakeSkill("P\n");
    const cases: {
      installed: string | undefined;
      recorded: string | undefined;
      status: string;
    }[] = [
      { installed: undefined, recorded: undefined, status: "missing" },
      { installed: "P\n", recorded: undefined, status: "fresh" },
      { installed: "P\n", recorded: hashContent("P\n"), status: "fresh" },
      { installed: "old\n", recorded: hashContent("old\n"), status: "stale" },
      { installed: "edit\n", recorded: hashContent("P\n"), status: "modified" },
      { installed: "edit\n", recorded: undefined, status: "modified" },
      {
        installed: "edit\n",
        recorded: hashContent("old\n"),
        status: "stale-modified",
      },
    ];
    for (const { installed, recorded, status } of cases) {
      const root = makeTempDir();
      if (installed !== undefined) {
        write(root, ".claude/skills/paramour/SKILL.md", installed);
      }
      if (recorded !== undefined) {
        writeManifest(root, { "SKILL.md": recorded });
      }
      const audit = auditTarget(claudeTarget(root), packaged);
      expect(audit.files).toEqual([{ relPath: "SKILL.md", status }]);
    }
  });

  it("a CRLF-mangled but content-equal install audits fresh", () => {
    const packaged = fakeSkill("line one\nline two\n");
    const root = makeTempDir();
    write(root, ".claude/skills/paramour/SKILL.md", "line one\r\nline two\r\n");
    const audit = auditTarget(claudeTarget(root), packaged);
    expect(audit.files).toEqual([{ relPath: "SKILL.md", status: "fresh" }]);
  });

  it("classifies orphans as managed only when byte-untouched or gone", () => {
    const packaged = fakeSkill();
    const root = makeTempDir();
    write(
      root,
      ".claude/skills/paramour/SKILL.md",
      packaged.files[0]?.content ?? "",
    );
    write(root, ".claude/skills/paramour/references/old.md", "old\n");
    write(root, ".claude/skills/paramour/references/edited.md", "edited\n");
    writeManifest(root, {
      "references/edited.md": hashContent("original\n"),
      "references/gone.md": hashContent("gone\n"),
      "references/old.md": hashContent("old\n"),
      "SKILL.md": packaged.files[0]?.hash ?? "",
    });
    const audit = auditTarget(claudeTarget(root), packaged);
    expect(audit.orphans).toEqual([
      { managed: false, relPath: "references/edited.md" },
      { managed: true, relPath: "references/gone.md" },
      { managed: true, relPath: "references/old.md" },
    ]);
  });
});

describe("skills sync", () => {
  it("writes missing and stale files, adopts fresh ones, updates the manifest", () => {
    const packaged = fakeSkill("new\n");
    const root = makeTempDir();
    write(root, ".claude/skills/paramour/SKILL.md", "old\n");
    writeManifest(root, { "SKILL.md": hashContent("old\n") });
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: false,
    });
    expect(result.written).toEqual(["SKILL.md"]);
    expect(
      readFileSync(
        join(root, ".claude", "skills", "paramour", "SKILL.md"),
        "utf8",
      ),
    ).toBe("new\n");
    expect(readSkillManifest(claudeTarget(root).skillDir)).toEqual({
      files: { "SKILL.md": hashContent("new\n") },
      skill: "paramour",
      version: "9.9.9",
    });
  });

  it("refuses to overwrite local edits without force, keeping the old record", () => {
    const packaged = fakeSkill("new\n");
    const root = makeTempDir();
    write(root, ".claude/skills/paramour/SKILL.md", "edited\n");
    writeManifest(root, { "SKILL.md": hashContent("old\n") });
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: false,
    });
    expect(result.skippedModified).toEqual(["SKILL.md"]);
    expect(result.written).toEqual([]);
    expect(
      readFileSync(
        join(root, ".claude", "skills", "paramour", "SKILL.md"),
        "utf8",
      ),
    ).toBe("edited\n");
    // The old hash survives so the next audit still reads stale-modified.
    expect(readSkillManifest(claudeTarget(root).skillDir)?.files).toEqual({
      "SKILL.md": hashContent("old\n"),
    });
    const forced = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: true,
    });
    expect(forced.written).toEqual(["SKILL.md"]);
    expect(
      readFileSync(
        join(root, ".claude", "skills", "paramour", "SKILL.md"),
        "utf8",
      ),
    ).toBe("new\n");
  });

  it("removes managed orphans and leaves unmanaged ones untracked", () => {
    const packaged = fakeSkill();
    const root = makeTempDir();
    write(root, ".claude/skills/paramour/references/old.md", "old\n");
    write(root, ".claude/skills/paramour/references/edited.md", "edited\n");
    writeManifest(root, {
      "references/edited.md": hashContent("original\n"),
      "references/old.md": hashContent("old\n"),
    });
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: false,
    });
    expect(result.removedOrphans).toEqual(["references/old.md"]);
    expect(result.keptOrphans).toEqual(["references/edited.md"]);
    const skillDir = claudeTarget(root).skillDir;
    expect(existsSync(join(skillDir, "references", "old.md"))).toBe(false);
    expect(existsSync(join(skillDir, "references", "edited.md"))).toBe(true);
    expect(readSkillManifest(skillDir)?.files).toEqual({
      "SKILL.md": packaged.files[0]?.hash,
    });
  });

  it("dry mode reports without touching the disk", () => {
    const packaged = fakeSkill();
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    const before = snapshotTree(root);
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: true,
      force: false,
    });
    expect(result.written).toEqual(["SKILL.md"]);
    expect(snapshotTree(root)).toEqual(before);
  });

  it("a traversal key in a tampered manifest cannot delete files outside", () => {
    const packaged = fakeSkill();
    const root = makeTempDir();
    write(root, "src/index.ts", "export {};\n");
    write(
      root,
      ".claude/skills/paramour/SKILL.md",
      packaged.files[0]?.content ?? "",
    );
    // The escaping key records the outside file's real hash, so if the key
    // survived validation it would audit as a managed orphan and be removed.
    writeManifest(root, {
      "../../../src/index.ts": hashContent("export {};\n"),
      "SKILL.md": packaged.files[0]?.hash ?? "",
    });
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: false,
    });
    expect(result.removedOrphans).toEqual([]);
    expect(readFileSync(join(root, "src", "index.ts"), "utf8")).toBe(
      "export {};\n",
    );
  });

  it("does not adopt a user-owned directory when every file is refused", () => {
    const packaged = fakeSkill("packaged\n");
    const root = makeTempDir();
    write(root, ".claude/skills/paramour/SKILL.md", "hand-authored\n");
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: false,
    });
    expect(result.skippedModified).toEqual(["SKILL.md"]);
    expect(result.written).toEqual([]);
    const skillDir = claudeTarget(root).skillDir;
    expect(existsSync(join(skillDir, MANIFEST_FILENAME))).toBe(false);
    expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toBe(
      "hand-authored\n",
    );
  });

  it("still rewrites the manifest when prior provenance exists but edits are skipped", () => {
    const packaged = fakeSkill("new\n");
    const root = makeTempDir();
    write(root, ".claude/skills/paramour/SKILL.md", "edited\n");
    writeManifest(root, { "SKILL.md": hashContent("old\n") }, "1.0.0");
    const result = syncTarget(claudeTarget(root), packaged, {
      dry: false,
      force: false,
    });
    expect(result.skippedModified).toEqual(["SKILL.md"]);
    const manifest = readSkillManifest(claudeTarget(root).skillDir);
    // The version bump proves the manifest was rewritten, not left behind.
    expect(manifest?.version).toBe("9.9.9");
    expect(manifest?.files).toEqual({ "SKILL.md": hashContent("old\n") });
  });
});

describe("paramour skills (CLI)", () => {
  it("installs the bundled skill into a detected tool, byte-identically", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    const run = await skills();
    expect(run.code).toBe(0);
    expect(run.err).toEqual([]);
    expect(run.out.join("\n")).toContain(
      "✔ .claude/skills/paramour — installed",
    );
    const packaged = loadPackagedSkill();
    expect(packaged.files.length).toBeGreaterThan(0);
    for (const file of packaged.files) {
      const installed = readFileSync(
        join(root, ".claude", "skills", "paramour", ...file.relPath.split("/")),
        "utf8",
      );
      expect(installed).toBe(file.content);
    }
    const manifest = readSkillManifest(
      join(root, ".claude", "skills", "paramour"),
    );
    expect(manifest?.version).toBe(packaged.version);
    expect(Object.keys(manifest?.files ?? {}).sort()).toEqual(
      packaged.files.map((file) => file.relPath),
    );
  });

  it("a re-run is a byte-identical no-op", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    await skills();
    const before = snapshotTree(root);
    const run = await skills();
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "• .claude/skills/paramour — up to date",
    );
    expect(snapshotTree(root)).toEqual(before);
  });

  it("writes every detected tool", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/", ".cursor/"]);
    process.chdir(root);
    const run = await skills();
    expect(run.code).toBe(0);
    expect(
      existsSync(join(root, ".claude", "skills", "paramour", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(root, ".cursor", "skills", "paramour", "SKILL.md")),
    ).toBe(true);
  });

  it("falls back to the portable location when nothing is detected", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const run = await skills();
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "no agent tooling detected — installing to the portable .agents/skills/",
    );
    expect(
      existsSync(join(root, ".agents", "skills", "paramour", "SKILL.md")),
    ).toBe(true);
  });

  it("skips locally-modified files and overwrites them under --force", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    await skills();
    const skillPath = join(root, ".claude", "skills", "paramour", "SKILL.md");
    writeFileSync(skillPath, "my local tailoring\n");
    const run = await skills();
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "1 locally-modified file left as-is (--force overwrites)",
    );
    expect(readFileSync(skillPath, "utf8")).toBe("my local tailoring\n");
    const forced = await skills(["--force"]);
    expect(forced.code).toBe(0);
    expect(readFileSync(skillPath, "utf8")).not.toBe("my local tailoring\n");
  });

  it("--dry-run reports the install without writing", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    const before = snapshotTree(root);
    const run = await skills(["--dry-run"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("would install");
    expect(snapshotTree(root)).toEqual(before);
  });

  it("--check passes on a fresh install and fails once a file is stale", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    await skills();
    const fresh = await skills(["--check"]);
    expect(fresh.code).toBe(0);
    expect(fresh.out.join("\n")).toContain(
      "✔ .claude/skills/paramour — up to date",
    );
    // Simulate a package upgrade: rewrite an installed file AND its manifest
    // record to a bygone version, exactly what an old install looks like.
    const skillDir = join(root, ".claude", "skills", "paramour");
    writeFileSync(join(skillDir, "SKILL.md"), "previous release\n");
    const manifest = readSkillManifest(skillDir);
    if (manifest === undefined) throw new Error("manifest missing");
    manifest.files["SKILL.md"] = hashContent("previous release\n");
    writeFileSync(join(skillDir, MANIFEST_FILENAME), renderManifest(manifest));
    const stale = await skills(["--check"]);
    expect(stale.code).toBe(1);
    const text = stale.out.join("\n");
    expect(text).toContain(
      "✖ .claude/skills/paramour — stale (run `paramour skills`)",
    );
    expect(text).toContain(
      "SKILL.md: packaged content changed — run `paramour skills`",
    );
  });

  it("--check fails when not installed and warns (exit 0) on local edits only", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    const missing = await skills(["--check"]);
    expect(missing.code).toBe(1);
    expect(missing.out.join("\n")).toContain(
      "✖ .claude/skills/paramour — not installed (run `paramour skills`)",
    );
    await skills();
    writeFileSync(
      join(root, ".claude", "skills", "paramour", "SKILL.md"),
      "my local tailoring\n",
    );
    const modified = await skills(["--check"]);
    expect(modified.code).toBe(0);
    const text = modified.out.join("\n");
    expect(text).toContain("⚠ .claude/skills/paramour — locally modified");
    expect(text).toContain("0 stale, 1 modified");
  });

  it("--check --json reports per-file statuses", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    await skills();
    const run = await skills(["--check", "--json"]);
    expect(run.code).toBe(0);
    const payload = JSON.parse(run.out.join("\n")) as {
      status: string;
      targets: { files: { status: string }[]; rel: string; tool: string }[];
    };
    expect(payload.status).toBe("pass");
    expect(payload.targets).toHaveLength(1);
    expect(payload.targets[0]?.tool).toBe("claude");
    expect(
      payload.targets[0]?.files.every((file) => file.status === "fresh"),
    ).toBe(true);
  });

  it("--check passes with nothing to check when no tooling is detected", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const run = await skills(["--check"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "no agent tooling detected — nothing to check",
    );
  });

  it("--check --json reports the no-tooling pass with empty targets", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const run = await skills(["--check", "--json"]);
    expect(run.code).toBe(0);
    expect(JSON.parse(run.out.join("\n"))).toEqual({
      fallback: true,
      status: "pass",
      targets: [],
    });
  });

  it("--check --tool audits the named tool even in an empty project", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const run = await skills(["--check", "--tool", "agents"]);
    expect(run.code).toBe(1);
    expect(run.out.join("\n")).toContain(
      "✖ .agents/skills/paramour — not installed (run `paramour skills`)",
    );
  });

  it("install --json carries dry and fallback so runs are distinguishable", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const dry = await skills(["--dry-run", "--json"]);
    expect(dry.code).toBe(0);
    const dryPayload = JSON.parse(dry.out.join("\n")) as {
      dry: boolean;
      fallback: boolean;
    };
    expect(dryPayload.dry).toBe(true);
    expect(dryPayload.fallback).toBe(true);
    expect(existsSync(join(root, ".agents"))).toBe(false);
    const real = await skills(["--json"]);
    expect(real.code).toBe(0);
    const realPayload = JSON.parse(real.out.join("\n")) as {
      dry: boolean;
      fallback: boolean;
    };
    expect(realPayload.dry).toBe(false);
    expect(realPayload.fallback).toBe(true);
    const detectedRoot = makeTempDir();
    makeTree(detectedRoot, [".claude/"]);
    process.chdir(detectedRoot);
    const detected = await skills(["--json"]);
    const detectedPayload = JSON.parse(detected.out.join("\n")) as {
      dry: boolean;
      fallback: boolean;
    };
    expect(detectedPayload.dry).toBe(false);
    expect(detectedPayload.fallback).toBe(false);
  });

  it("rejects --check with write-shaping flags and unknown --tool (exit 2)", async () => {
    const root = makeTempDir();
    process.chdir(root);
    for (const argv of [
      ["--check", "--force"],
      ["--check", "--dry-run"],
      ["--tool", "copilot"],
    ]) {
      const run = await skills(argv);
      expect(run.code).toBe(2);
      expect(run.err.length).toBeGreaterThan(0);
    }
  });

  it("--tool installs to the named tool regardless of detection", async () => {
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    process.chdir(root);
    const run = await skills(["--tool", "codex"]);
    expect(run.code).toBe(0);
    expect(
      existsSync(join(root, ".codex", "skills", "paramour", "SKILL.md")),
    ).toBe(true);
    expect(existsSync(join(root, ".claude", "skills", "paramour"))).toBe(false);
  });

  it("--help prints skills usage and exits 0", async () => {
    process.chdir(makeTempDir());
    const run = await skills(["--help"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("Usage: paramour skills");
  });
});
