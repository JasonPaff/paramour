import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { emitArtifact } from "../src/emit.js";
import { makeTempDir, makeTree } from "./helpers.js";

/** App-only emission — what this suite's fixtures produce. */
function emitApp(appRoutes: readonly string[]): string {
  return emitArtifact({ appRoutes, pagesRoutes: [] });
}

/**
 * Smoke test of the BUILT bin: proves the tsc emit, shebang, and
 * jiti-resolution wiring — the seams the in-process cli.test.ts suite cannot
 * see. Skipped when dist is absent locally; always runs in CI because
 * `pnpm build` precedes `pnpm test` there.
 */
const distCli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

describe.skipIf(!existsSync(distCli))("dist/cli.js (bin)", () => {
  it("one-shot generates through the built bin (exit 0)", () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx"]);
    const result = spawnSync(process.execPath, [distCli, "generate"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wrote");
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitApp(["/"]),
    );
  });

  it("--check on drift exits 1 with the diff on stderr", () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx", "app/new/page.tsx"]);
    writeFileSync(join(root, "paramour-env.d.ts"), emitApp(["/", "/old"]));
    const result = spawnSync(
      process.execPath,
      [distCli, "generate", "--check"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("+ /new");
    expect(result.stderr).toContain("- /old");
  });

  it("the check alias and the global help work through the built bin", () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx"]);
    writeFileSync(join(root, "paramour-env.d.ts"), emitApp(["/"]));
    const check = spawnSync(process.execPath, [distCli, "check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("up to date");
    const help = spawnSync(process.execPath, [distCli, "--help"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(help.status).toBe(0);
    for (const command of [
      "check",
      "doctor",
      "generate",
      "init",
      "list",
      "skills",
    ]) {
      expect(help.stdout).toContain(command);
    }
  });

  it("installs the bundled agent skill through the built bin", () => {
    // Proves the dist layout resolves `../../skills/` from dist/skills/ —
    // the packaging seam the in-process suite cannot see.
    const root = makeTempDir();
    makeTree(root, [".claude/"]);
    const result = spawnSync(process.execPath, [distCli, "skills"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("✔ .claude/skills/paramour — installed");
    expect(
      existsSync(join(root, ".claude", "skills", "paramour", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(
        join(root, ".claude", "skills", "paramour", ".paramour-skills.json"),
      ),
    ).toBe(true);
  });

  it("loads a paramour.config.ts through jiti from the built bin", () => {
    const root = makeTempDir();
    makeTree(root, ["docs/page.mdx"]);
    writeFileSync(
      join(root, "paramour.config.ts"),
      `export default { appDir: "docs", pageExtensions: ["mdx"] };\n`,
    );
    const result = spawnSync(process.execPath, [distCli, "generate"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitApp(["/"]),
    );
  });
});
