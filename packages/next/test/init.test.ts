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
import { makeTempDir, makeTree } from "./helpers.js";

const originalCwd = process.cwd();
afterEach(() => {
  process.chdir(originalCwd);
});

const PACKAGE_JSON = `{
  "name": "fixture",
  "private": true,
  "dependencies": {
    "@paramour-js/next": "0.0.0",
    "next": "16.0.0",
    "paramour": "0.0.0"
  }
}
`;

const NEXT_CONFIG_TS = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

async function init(
  argv: readonly string[] = [],
): Promise<{ code: number; err: string[]; out: string[] }> {
  const err: string[] = [];
  const out: string[] = [];
  const code = await runCli(["init", ...argv], {
    stderr: (line) => {
      err.push(line);
    },
    stdout: (line) => {
      out.push(line);
    },
  });
  return { code, err, out };
}

function makeProject(
  entries: readonly string[],
  files: Record<string, string> = {},
): string {
  const root = makeTempDir();
  makeTree(root, entries);
  for (const [name, content] of Object.entries(files)) {
    const abs = join(root, ...name.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  process.chdir(root);
  return root;
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

describe("paramour init", () => {
  it("runs every step on a fresh project (exit 0)", async () => {
    const root = makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
    });
    const run = await init();
    expect(run.code).toBe(0);
    expect(run.err).toEqual([]);
    const text = run.out.join("\n");
    expect(text).toContain("✔ created paramour.config.ts");
    expect(text).toContain("✔ wrapped next.config.ts with withTypedRoutes");
    expect(text).toContain(`✔ added "paramour" script to package.json`);
    expect(text).toContain("✔ wrote paramour-env.d.ts (1 route)");
    expect(text).toContain("Commit the generated artifact");

    expect(readFileSync(join(root, "paramour.config.ts"), "utf8")).toContain(
      "satisfies ParamourConfig",
    );
    expect(readFileSync(join(root, "next.config.ts"), "utf8")).toContain(
      "export default withTypedRoutes(nextConfig);",
    );
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.paramour).toBe("paramour generate");
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(true);
  });

  it("is idempotent: a second run skips every step and changes nothing", async () => {
    const root = makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
    });
    await init();
    const before = snapshotTree(root);
    const run = await init();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("• paramour.config.ts already exists");
    expect(text).toContain("• next.config.ts already wraps withTypedRoutes");
    expect(text).toContain(`• package.json already has a "paramour" script`);
    expect(text).toContain("• paramour-env.d.ts already up to date (1 route)");
    expect(snapshotTree(root)).toEqual(before);
  });

  it("--dry-run reports every step and writes nothing", async () => {
    const root = makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
    });
    const before = snapshotTree(root);
    const run = await init(["--dry-run"]);
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("dry run");
    expect(text).toContain("✔ would create paramour.config.ts");
    expect(text).toContain("✔ would wrap next.config.ts");
    expect(text).toContain(`✔ would add "paramour" script`);
    expect(text).toContain("✔ would write paramour-env.d.ts (1 route)");
    expect(snapshotTree(root)).toEqual(before);
  });

  it("each --no-* flag skips exactly its step", async () => {
    const root = makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
    });
    const run = await init([
      "--no-config",
      "--no-generate",
      "--no-script",
      "--no-wrap",
    ]);
    expect(run.code).toBe(0);
    expect(existsSync(join(root, "paramour.config.ts"))).toBe(false);
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
    expect(readFileSync(join(root, "next.config.ts"), "utf8")).toBe(
      NEXT_CONFIG_TS,
    );
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(PACKAGE_JSON);
  });

  it("--force overwrites an existing paramour.config.ts", async () => {
    const root = makeProject(["app/page.tsx"], {
      "package.json": PACKAGE_JSON,
      "paramour.config.ts": `export default { appDir: "app" };\n`,
    });
    const kept = await init(["--no-generate", "--no-wrap"]);
    expect(kept.out.join("\n")).toContain("already exists");
    expect(readFileSync(join(root, "paramour.config.ts"), "utf8")).toContain(
      `appDir: "app"`,
    );
    const forced = await init(["--force", "--no-generate", "--no-wrap"]);
    expect(forced.code).toBe(0);
    expect(forced.out.join("\n")).toContain("overwrote via --force");
    expect(readFileSync(join(root, "paramour.config.ts"), "utf8")).toContain(
      "satisfies ParamourConfig",
    );
  });

  it("--force replaces an existing paramour.config.json instead of shadowing it", async () => {
    const root = makeProject(["app/page.tsx"], {
      "package.json": PACKAGE_JSON,
      "paramour.config.json": `{ "outFile": "types/routes.d.ts" }`,
    });
    const forced = await init(["--force", "--no-generate", "--no-wrap"]);
    expect(forced.code).toBe(0);
    expect(forced.out.join("\n")).toContain(
      "replaced paramour.config.json via --force",
    );
    expect(existsSync(join(root, "paramour.config.json"))).toBe(false);
    expect(readFileSync(join(root, "paramour.config.ts"), "utf8")).toContain(
      "satisfies ParamourConfig",
    );
  });

  it("exits 2 without a package.json", async () => {
    makeProject(["app/page.tsx"]);
    const run = await init();
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain("no package.json");
  });

  it("exits 2 on a malformed package.json", async () => {
    makeProject(["app/page.tsx"], { "package.json": `{ "name": ` });
    const run = await init();
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain("package.json");
  });

  it("exits 2 when package.json scripts is not an object", async () => {
    makeProject(["app/page.tsx"], {
      "package.json": `{ "name": "fixture", "scripts": ["build"] }`,
    });
    const run = await init();
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain(`"scripts" must be an object`);
  });

  it("prints the manual snippet for a CJS next.config.js and still exits 0", async () => {
    const cjs = `module.exports = { reactStrictMode: true };\n`;
    const root = makeProject(["app/page.tsx"], {
      "next.config.js": cjs,
      "package.json": PACKAGE_JSON,
    });
    const run = await init();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("could not transform next.config.js safely");
    expect(text).toContain(
      `import { withTypedRoutes } from "@paramour-js/next";`,
    );
    expect(readFileSync(join(root, "next.config.js"), "utf8")).toBe(cjs);
  });

  it("prints guidance when no next.config exists", async () => {
    makeProject(["app/page.tsx"], { "package.json": PACKAGE_JSON });
    const run = await init(["--no-generate"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("no next.config found");
  });

  it("warns and skips generate when no route directory exists yet", async () => {
    const root = makeProject([], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
    });
    const run = await init();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("⚠ no route directory yet — skipped generate");
    expect(text).toContain("no route directory found yet");
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
  });

  it("maps a route collision during the first generate to exit 2", async () => {
    makeProject(["app/about/page.tsx", "pages/about.tsx"], {
      "package.json": PACKAGE_JSON,
    });
    const run = await init(["--no-wrap"]);
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain("collision");
  });

  it("summary verifies dependencies and tsconfig coverage", async () => {
    makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": `{ "name": "fixture", "private": true }\n`,
      "tsconfig.json": `{
  // JSONC on purpose
  "include": ["app/**/*.tsx"],
}
`,
    });
    const run = await init(["--no-wrap"]);
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("missing dependencies: @paramour-js/next, paramour");
    expect(text).toContain("tsconfig include may not cover paramour-env.d.ts");
  });

  it("a src-scoped globstar include does not cover a root-level artifact", async () => {
    makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
      "tsconfig.json": `{ "include": ["src/**/*.ts"] }`,
    });
    const run = await init(["--no-wrap"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "tsconfig include may not cover paramour-env.d.ts",
    );
  });

  it("a Next-style tsconfig include covers the artifact", async () => {
    makeProject(["app/page.tsx"], {
      "next.config.ts": NEXT_CONFIG_TS,
      "package.json": PACKAGE_JSON,
      "tsconfig.json": `{ "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"] }`,
    });
    const run = await init(["--no-wrap"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(
      "tsconfig.json includes paramour-env.d.ts",
    );
  });
});
