import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emitArtifact } from "../src";
import { watcherLockPath } from "../src/lock.js";
import { type CliIo, runCli } from "../src/run-cli.js";
import { makeTempDir, makeTree } from "./helpers.js";

const originalCwd = process.cwd();
const children: ChildProcess[] = [];
const controllers: AbortController[] = [];
const pending: Promise<unknown>[] = [];

afterEach(async () => {
  // Stop watch runs and AWAIT them before helpers' afterEach removes the
  // temp trees (open FSWatcher handles block Windows rmdir).
  for (const controller of controllers.splice(0)) controller.abort();
  await Promise.all(pending.splice(0));
  process.chdir(originalCwd);
  for (const child of children.splice(0)) child.kill();
});

/** Captured-io runCli invocation against the current working directory. */
interface CliRun {
  code: Promise<number>;
  err: string[];
  out: string[];
}

function cli(argv: readonly string[], io: CliIo = {}): CliRun {
  const err: string[] = [];
  const out: string[] = [];
  const code = runCli(argv, {
    stderr: (line) => {
      err.push(line);
    },
    stdout: (line) => {
      out.push(line);
    },
    ...io,
  });
  pending.push(code);
  return { code, err, out };
}

/**
 * A live process other than the test process; killed after the test.
 * Spawned outside the temp project (Windows cleanup, see with-typed-routes
 * suite).
 */
function livePid(): number {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: originalCwd,
  });
  children.push(child);
  if (child.pid === undefined) throw new Error("spawn yielded no pid");
  return child.pid;
}

/** Temp project made the working directory (projectRoot = cwd, TR7). */
function makeProject(entries: readonly string[]): string {
  const root = makeTempDir();
  makeTree(root, entries);
  process.chdir(root);
  return root;
}

describe("paramour generate — one-shot (TR7)", () => {
  it("writes the artifact and exits 0", async () => {
    const root = makeProject(["app/page.tsx", "app/about/page.tsx"]);
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(0);
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/", "/about"]),
    );
    expect(run.out).toEqual([expect.stringContaining("wrote")]);
    expect(run.out[0]).toContain("2 routes");
  });

  it("reports unchanged on a second run", async () => {
    makeProject(["app/page.tsx"]);
    await cli(["generate"]).code;
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(0);
    expect(run.out).toEqual([expect.stringContaining("unchanged")]);
  });

  it("pluralizes the route count message correctly for one route", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(0);
    expect(run.out[0]).toContain("(1 route)");
    expect(run.out[0]).not.toContain("1 routes");
  });

  it("fails loudly (exit 2) when no app dir exists", async () => {
    const root = makeProject(["src/pages/index.tsx"]);
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([expect.stringContaining("no app directory")]);
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
  });

  it("rejects an --app-dir that does not exist (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate", "--app-dir", "nope"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([
      expect.stringContaining("app directory not found"),
    ]);
  });
});

describe("paramour generate — flags and usage (TR7)", () => {
  it("--help prints usage to stdout and exits 0", async () => {
    makeProject([]);
    const run = cli(["--help"]);
    await expect(run.code).resolves.toBe(0);
    expect(run.out.join("\n")).toContain("Usage: paramour generate");
    expect(run.err).toEqual([]);
  });

  it("rejects an unknown flag with usage on stderr (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate", "--frobnicate"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err.join("\n")).toContain("Usage: paramour generate");
  });

  it("rejects a bad or missing subcommand (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    await expect(cli(["frobnicate"]).code).resolves.toBe(2);
    await expect(cli([]).code).resolves.toBe(2);
  });

  it("-h short alias prints usage to stdout and exits 0", async () => {
    makeProject([]);
    const run = cli(["-h"]);
    await expect(run.code).resolves.toBe(0);
    expect(run.out.join("\n")).toContain("Usage: paramour generate");
    expect(run.err).toEqual([]);
  });

  it("rejects a stray extra positional (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate", "extra"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err.join("\n")).toContain("exactly one command");
  });

  it("rejects --watch --check together (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate", "--watch", "--check"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([expect.stringContaining("mutually exclusive")]);
  });

  it("rejects an empty --page-extensions list (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate", "--page-extensions", " , "]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([expect.stringContaining("--page-extensions")]);
  });

  it("rejects --page-extensions entries with a leading dot (exit 2)", async () => {
    makeProject(["app/page.tsx"]);
    const run = cli(["generate", "--page-extensions", ".tsx,mdx"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([
      expect.stringContaining('must not start with a dot: ".tsx"'),
    ]);
  });
});

describe("paramour generate — config precedence (TR7 / §7.2)", () => {
  it("uses config-file values when no flags are passed", async () => {
    const root = makeProject(["customapp/page.mdx"]);
    writeFileSync(
      join(root, "paramour.config.json"),
      `{ "appDir": "customapp", "outFile": "types/routes.d.ts", "pageExtensions": ["mdx"] }`,
    );
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(0);
    expect(readFileSync(join(root, "types", "routes.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
  });

  it("flags beat the config file for every key", async () => {
    const root = makeProject([
      "cfgapp/page.mdx",
      "flagapp/page.tsx",
      "flagapp/x/page.tsx",
    ]);
    writeFileSync(
      join(root, "paramour.config.json"),
      `{ "appDir": "cfgapp", "outFile": "cfg.d.ts", "pageExtensions": ["mdx"] }`,
    );
    const run = cli([
      "generate",
      "--app-dir",
      "flagapp",
      "--out-file",
      "flag.d.ts",
      "--page-extensions",
      "tsx",
    ]);
    await expect(run.code).resolves.toBe(0);
    expect(readFileSync(join(root, "flag.d.ts"), "utf8")).toBe(
      emitArtifact(["/", "/x"]),
    );
    expect(existsSync(join(root, "cfg.d.ts"))).toBe(false);
  });

  it("an invalid config file is exit 2 with the key named", async () => {
    const root = makeProject(["app/page.tsx"]);
    writeFileSync(
      join(root, "paramour.config.json"),
      `{ "pagesExtensions": ["tsx"] }`,
    );
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([
      expect.stringContaining("unknown key `pagesExtensions`"),
    ]);
  });

  it("a config-file appDir pointing at a nonexistent dir is exit 2", async () => {
    const root = makeProject(["app/page.tsx"]);
    writeFileSync(join(root, "paramour.config.json"), `{ "appDir": "gone" }`);
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([
      expect.stringContaining("app directory not found"),
    ]);
  });

  it("malformed JSON in the config file is exit 2 with the file named, not a crash", async () => {
    const root = makeProject(["app/page.tsx"]);
    writeFileSync(join(root, "paramour.config.json"), `{ "appDir": `);
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err).toEqual([
      expect.stringContaining("paramour.config.json: invalid JSON"),
    ]);
  });

  it("an .mjs config that throws at import is exit 2, not a crash", async () => {
    const root = makeProject(["app/page.tsx"]);
    writeFileSync(
      join(root, "paramour.config.mjs"),
      `throw new Error("config module exploded");\n`,
    );
    const run = cli(["generate"]);
    await expect(run.code).resolves.toBe(2);
    expect(run.err.join("\n")).toContain("config module exploded");
  });
});

describe("paramour generate --check (TR7)", () => {
  it("exits 0 on a fresh artifact", async () => {
    const root = makeProject(["app/page.tsx"]);
    writeFileSync(join(root, "paramour-env.d.ts"), emitArtifact(["/"]));
    const run = cli(["generate", "--check"]);
    await expect(run.code).resolves.toBe(0);
    expect(run.out).toEqual([expect.stringContaining("up to date")]);
  });

  it("exits 1 on drift with the +/- diff, without writing", async () => {
    const root = makeProject(["app/page.tsx", "app/new/page.tsx"]);
    const stale = emitArtifact(["/", "/old"]);
    writeFileSync(join(root, "paramour-env.d.ts"), stale);
    const run = cli(["generate", "--check"]);
    await expect(run.code).resolves.toBe(1);
    const err = run.err.join("\n");
    expect(err).toContain("out of date");
    expect(err).toContain("  + /new");
    expect(err).toContain("  - /old");
    expect(err).toContain("Run `paramour generate`");
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(stale);
  });

  it("treats a missing artifact as drift (exit 1)", async () => {
    const root = makeProject(["app/page.tsx"]);
    const run = cli(["generate", "--check"]);
    await expect(run.code).resolves.toBe(1);
    expect(run.err.join("\n")).toContain("is missing");
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
  });

  it("missing app dir is exit 2, not drift", async () => {
    makeProject([]);
    await expect(cli(["generate", "--check"]).code).resolves.toBe(2);
  });

  it("reports byte drift with an identical route set (hand-edited artifact)", async () => {
    const root = makeProject(["app/page.tsx"]);
    // Same union, different bytes: the header line removed.
    writeFileSync(
      join(root, "paramour-env.d.ts"),
      emitArtifact(["/"]).split("\n").slice(1).join("\n"),
    );
    const run = cli(["generate", "--check"]);
    await expect(run.code).resolves.toBe(1);
    expect(run.err.join("\n")).toContain(
      "content differs from generator output",
    );
  });
});

describe("paramour generate --watch (TR5/TR6/TR7)", { retry: 2 }, () => {
  function watchCli(argv: readonly string[]): CliRun {
    const controller = new AbortController();
    controllers.push(controller);
    return cli(argv, { signal: controller.signal });
  }

  it("generates, holds the lock, regenerates on route add, exits 0 on abort", async () => {
    const root = makeProject(["app/page.tsx"]);
    const artifact = join(root, "paramour-env.d.ts");
    const run = watchCli(["generate", "--watch"]);
    await vi.waitFor(() => {
      expect(readFileSync(artifact, "utf8")).toBe(emitArtifact(["/"]));
    }, 5000);
    expect(readFileSync(watcherLockPath(root), "utf8")).toBe(
      String(process.pid),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    makeTree(root, ["app/pricing/page.tsx"]);
    await vi.waitFor(() => {
      expect(readFileSync(artifact, "utf8")).toBe(
        emitArtifact(["/", "/pricing"]),
      );
    }, 5000);
    controllers.splice(0).forEach((controller) => {
      controller.abort();
    });
    await expect(run.code).resolves.toBe(0);
    // Lock released on abort.
    expect(existsSync(watcherLockPath(root))).toBe(false);
  });

  it("warns but keeps watching when initial generation fails; a pre-aborted signal resolves 0", async () => {
    // --out-file pointing at an existing DIRECTORY makes the initial
    // generation throw (EISDIR) — transient I/O must not kill the watcher.
    makeProject(["app/page.tsx", "artifact-dir/"]);
    const controller = new AbortController();
    controller.abort();
    const run = cli(["generate", "--watch", "--out-file", "artifact-dir"], {
      signal: controller.signal,
    });
    await expect(run.code).resolves.toBe(0);
    expect(run.err.join("\n")).toMatch(/initial generation failed/);
    expect(run.out.join("\n")).toContain("watching");
  });

  it("maps a watcher-lock acquisition failure to exit 2 instead of rejecting", async () => {
    const root = makeProject(["app/page.tsx"]);
    // The canonical lock path exists as a DIRECTORY: writing the pidfile
    // throws EISDIR, which must surface as the documented operational exit
    // code — never an unhandled rejection out of the bin.
    mkdirSync(watcherLockPath(root), { recursive: true });
    const controller = new AbortController();
    controller.abort();
    const run = cli(["generate", "--watch"], { signal: controller.signal });
    await expect(run.code).resolves.toBe(2);
    expect(run.err.join("\n")).toMatch(/EISDIR|directory/i);
  });

  it("declines when a live process holds the lock, still generating (exit 0)", async () => {
    const root = makeProject(["app/page.tsx"]);
    const lockPath = watcherLockPath(root);
    mkdirSync(dirname(lockPath), { recursive: true });
    const owner = livePid();
    writeFileSync(lockPath, String(owner));
    const run = watchCli(["generate", "--watch"]);
    await expect(run.code).resolves.toBe(0);
    expect(run.out.join("\n")).toContain(
      `watcher already running (pid ${String(owner)})`,
    );
    // Initial generation ran; the owner's lock is untouched (TR6).
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
    expect(readFileSync(lockPath, "utf8")).toBe(String(owner));
  });
});
