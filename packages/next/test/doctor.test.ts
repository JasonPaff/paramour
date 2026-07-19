import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { emitArtifact } from "../src/emit.js";
import { runCli } from "../src/run-cli.js";
import { makeTempDir, makeTree } from "./helpers.js";

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
  const entries: [string, string][] = [
    ["node_modules/@paramour-js/next/package.json", versions.next],
    ["node_modules/paramour/package.json", versions.core],
  ];
  for (const [file, version] of entries) {
    const abs = join(root, ...file.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      JSON.stringify({ name: file.split("/").slice(1, -1).join("/"), version }),
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

  it("a version mismatch warns but exits 0", async () => {
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
});
