import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { emitArtifact } from "../src/emit.js";
import { runCli } from "../src/run-cli.js";
import { linkCorePackage, makeTempDir, makeTree } from "./helpers.js";

const originalCwd = process.cwd();
afterEach(() => {
  process.chdir(originalCwd);
});

const WRAPPED_NEXT_CONFIG = `import { withTypedRoutes } from "@paramour-js/next";

const nextConfig = { reactStrictMode: true };

export default withTypedRoutes(nextConfig);
`;

async function doctor(
  argv: readonly string[] = [],
): Promise<{ code: number; err: string[]; out: string[] }> {
  const err: string[] = [];
  const out: string[] = [];
  const code = await runCli(["doctor", ...argv], {
    stderr: (line) => {
      err.push(line);
    },
    stdout: (line) => {
      out.push(line);
    },
  });
  return { code, err, out };
}

function fakeInstall(
  root: string,
  versions: { core: string; next: string },
): void {
  const entries: [string, Record<string, unknown>][] = [
    ["node_modules/@paramour-js/next/package.json", { version: versions.next }],
    ["node_modules/paramour/package.json", { version: versions.core }],
  ];
  for (const [file, fields] of entries) {
    const abs = join(root, ...file.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      JSON.stringify({
        name: file.split("/").slice(1, -1).join("/"),
        ...fields,
      }),
    );
  }
}

/** A project every check passes on. */
function makeHealthyProject(): string {
  const root = makeTempDir();
  makeTree(root, ["app/page.tsx"]);
  writeFileSync(
    join(root, "paramour-env.d.ts"),
    emitArtifact({ appRoutes: ["/"], pagesRoutes: [] }),
  );
  writeFileSync(join(root, "next.config.ts"), WRAPPED_NEXT_CONFIG);
  fakeInstall(root, { core: "1.0.0", next: "1.0.0" });
  process.chdir(root);
  return root;
}

describe("paramour doctor", () => {
  it("passes every check on a healthy project (exit 0)", async () => {
    makeHealthyProject();
    const run = await doctor();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("✔ config: no paramour.config file");
    expect(text).toContain("✔ route directories: app/");
    expect(text).toContain("✔ artifact: paramour-env.d.ts is up to date");
    expect(text).toContain(
      "✔ next.config: next.config.ts wraps withTypedRoutes",
    );
    expect(text).toContain(
      "✔ versions: paramour and @paramour-js/next are both 1.0.0",
    );
    expect(text).toContain("0 failed, 0 warnings");
    expect(text).not.toContain("✖");
  });

  it("a drifted artifact fails with the route diff (exit 1)", async () => {
    const root = makeHealthyProject();
    makeTree(root, ["app/new/page.tsx"]);
    const run = await doctor();
    expect(run.code).toBe(1);
    const text = run.out.join("\n");
    expect(text).toContain("✖ artifact: paramour-env.d.ts is out of date");
    expect(text).toContain("+ /new (app)");
    expect(text).toContain("run `paramour generate` and commit the result");
  });

  it("a missing artifact fails (exit 1), same stance as check", async () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx"]);
    writeFileSync(join(root, "next.config.ts"), WRAPPED_NEXT_CONFIG);
    fakeInstall(root, { core: "1.0.0", next: "1.0.0" });
    process.chdir(root);
    const run = await doctor();
    expect(run.code).toBe(1);
    expect(run.out.join("\n")).toContain(
      "✖ artifact: paramour-env.d.ts is missing",
    );
  });

  it("an unwrapped next.config warns but exits 0", async () => {
    const root = makeHealthyProject();
    writeFileSync(
      join(root, "next.config.ts"),
      `export default { reactStrictMode: true };\n`,
    );
    const run = await doctor();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain(
      "⚠ next.config: next.config.ts does not wrap withTypedRoutes",
    );
    expect(text).toContain("1 warning");
  });

  it("a lockstep mismatch (a half-upgraded app) warns but exits 0", async () => {
    const root = makeHealthyProject();
    fakeInstall(root, { core: "1.0.0", next: "1.1.0" });
    const run = await doctor();
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "⚠ versions: paramour 1.0.0 != @paramour-js/next 1.1.0",
    );
  });

  it("unresolvable packages fail (exit 1)", async () => {
    const root = makeTempDir();
    makeTree(root, ["app/page.tsx"]);
    writeFileSync(
      join(root, "paramour-env.d.ts"),
      emitArtifact({ appRoutes: ["/"], pagesRoutes: [] }),
    );
    writeFileSync(join(root, "next.config.ts"), WRAPPED_NEXT_CONFIG);
    process.chdir(root);
    const run = await doctor();
    expect(run.code).toBe(1);
    expect(run.out.join("\n")).toContain(
      "✖ versions: @paramour-js/next, paramour not resolvable in node_modules",
    );
  });

  it("resolves versions hoisted to a parent node_modules (workspaces)", async () => {
    const root = makeTempDir();
    const app = join(root, "apps", "web");
    makeTree(app, ["app/page.tsx"]);
    writeFileSync(
      join(app, "paramour-env.d.ts"),
      emitArtifact({ appRoutes: ["/"], pagesRoutes: [] }),
    );
    fakeInstall(root, { core: "1.0.0", next: "1.0.0" });
    process.chdir(app);
    const run = await doctor();
    expect(run.out.join("\n")).toContain(
      "✔ versions: paramour and @paramour-js/next are both 1.0.0",
    );
  });

  it("an invalid config file fails (exit 1)", async () => {
    const root = makeHealthyProject();
    writeFileSync(
      join(root, "paramour.config.json"),
      `{ "pagesExtensions": ["tsx"] }`,
    );
    const run = await doctor();
    expect(run.code).toBe(1);
    const text = run.out.join("\n");
    expect(text).toContain("✖ config: invalid");
    expect(text).toContain("unknown key `pagesExtensions`");
  });

  it("--json reports checks and the aggregate status", async () => {
    makeHealthyProject();
    const run = await doctor(["--json"]);
    expect(run.code).toBe(0);
    const payload = JSON.parse(run.out.join("\n")) as {
      checks: { label: string; status: string }[];
      status: string;
    };
    expect(payload.status).toBe("pass");
    expect(payload.checks.length).toBeGreaterThanOrEqual(6);
    expect(payload.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("--help prints doctor usage and exits 0", async () => {
    makeHealthyProject();
    const run = await doctor(["--help"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("Usage: paramour doctor");
  });

  it("skills: no agent tooling reads as a skipped pass", async () => {
    makeHealthyProject();
    const run = await doctor();
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "✔ skills: no agent tooling detected — skipped",
    );
  });

  it("skills: tooling without an install is a pass with a pointer", async () => {
    const root = makeHealthyProject();
    makeTree(root, [".claude/"]);
    const run = await doctor();
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "✔ skills: not installed (`paramour skills` installs agent skills for .claude/)",
    );
  });

  it("skills: a fresh install passes; local edits and staleness warn (exit 0)", async () => {
    const root = makeHealthyProject();
    makeTree(root, [".claude/"]);
    await runCli(["skills"], {
      stderr: () => undefined,
      stdout: () => undefined,
    });
    const fresh = await doctor();
    expect(fresh.code).toBe(0);
    expect(fresh.out.join("\n")).toContain(
      "✔ skills: .claude/skills/paramour is up to date",
    );

    const skillPath = join(root, ".claude", "skills", "paramour", "SKILL.md");
    writeFileSync(skillPath, "local tailoring\n");
    const modified = await doctor();
    expect(modified.code).toBe(0);
    const modifiedText = modified.out.join("\n");
    expect(modifiedText).toContain(
      "⚠ skills: .claude/skills/paramour has local edits",
    );
    expect(modifiedText).toContain("SKILL.md: locally modified");

    rmSync(skillPath);
    const stale = await doctor();
    expect(stale.code).toBe(0);
    const staleText = stale.out.join("\n");
    expect(staleText).toContain("⚠ skills: .claude/skills/paramour is stale");
    expect(staleText).toContain("SKILL.md: missing — run `paramour skills`");
  });

  describe("trailing slash vs next.config", () => {
    const SLASH_CONFIG = `import { withTypedRoutes } from "@paramour-js/next";

const nextConfig = { output: "export", trailingSlash: true };

export default withTypedRoutes(nextConfig);
`;

    const CORE_VERSION = (
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL("../../core/package.json", import.meta.url)),
          "utf8",
        ),
      ) as { version: string }
    ).version;

    /** Healthy project plus real route definitions (core linked, not faked). */
    function makeDefinedProject(routes: string, nextConfig: string): string {
      const root = makeTempDir();
      makeTree(root, ["app/page.tsx", "app/asset/page.tsx"]);
      writeFileSync(
        join(root, "paramour-env.d.ts"),
        emitArtifact({ appRoutes: ["/", "/asset"], pagesRoutes: [] }),
      );
      writeFileSync(join(root, "next.config.ts"), nextConfig);
      if (!linkCorePackage(root)) throw new Error("junction link failed");
      // The linked core's real version, so the lockstep check passes and the
      // exit code reflects only the check under test.
      const nextManifest = join(root, "node_modules", "@paramour-js", "next");
      mkdirSync(nextManifest, { recursive: true });
      writeFileSync(
        join(nextManifest, "package.json"),
        JSON.stringify({ name: "@paramour-js/next", version: CORE_VERSION }),
      );
      mkdirSync(join(root, "lib"));
      writeFileSync(join(root, "lib", "routes.ts"), routes);
      process.chdir(root);
      return root;
    }

    it("passes when every definition matches", async () => {
      makeDefinedProject(
        `import { defineAppRoute, p } from "paramour";
export const home = defineAppRoute("/", { trailingSlash: true });
export const asset = defineAppRoute("/asset", {
  search: { name: p.string() },
  trailingSlash: true,
});
`,
        SLASH_CONFIG,
      );
      const run = await doctor();
      expect(run.code).toBe(0);
      expect(run.out.join("\n")).toContain(
        "✔ trailing slash: route definitions match next.config.ts (trailingSlash: true)",
      );
    });

    it("warns, per route, when a definition disagrees (exit 0)", async () => {
      makeDefinedProject(
        `import { defineAppRoute } from "paramour";
export const home = defineAppRoute("/", { trailingSlash: true });
export const asset = defineAppRoute("/asset", {});
`,
        SLASH_CONFIG,
      );
      const run = await doctor();
      expect(run.code).toBe(0);
      const text = run.out.join("\n");
      expect(text).toContain(
        "⚠ trailing slash: 1 route definition disagrees with next.config.ts (trailingSlash: true)",
      );
      expect(text).toContain(
        "/asset (app) in lib/routes.ts: add trailingSlash: true to its definition",
      );
    });

    it("an opted-in route under Next's default warns too", async () => {
      makeDefinedProject(
        `import { defineAppRoute } from "paramour";
export const asset = defineAppRoute("/asset", { trailingSlash: true });
`,
        WRAPPED_NEXT_CONFIG,
      );
      const text = (await doctor()).out.join("\n");
      expect(text).toContain("(trailingSlash: false)");
      expect(text).toContain("remove trailingSlash: true from its definition");
    });

    it("says nothing when next.config's value is not static", async () => {
      makeDefinedProject(
        `import { defineAppRoute } from "paramour";
export const asset = defineAppRoute("/asset", {});
`,
        `export default () => ({ trailingSlash: true });
`,
      );
      expect((await doctor()).out.join("\n")).not.toContain("trailing slash:");
    });
  });
});
