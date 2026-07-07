import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emitArtifact, withTypedRoutes } from "../src";
import {
  devWatcherCountForTests,
  resetDevWatchersForTests,
} from "../src/with-typed-routes.js";
import { makeTempDir, makeTree } from "./helpers.js";

/**
 * TR4 suite. Values duplicated from next/constants on purpose — the phase
 * strings ARE the contract the wrapper dispatches on (hermeticity ruling).
 */
const PHASE_BUILD = "phase-production-build";
const PHASE_DEV = "phase-development-server";

const originalCwd = process.cwd();
const children: ChildProcess[] = [];

afterEach(() => {
  resetDevWatchersForTests();
  // Back out of the temp project before helpers' afterEach removes it
  // (hooks run in stack order, so this executes first).
  process.chdir(originalCwd);
  for (const child of children.splice(0)) child.kill();
  vi.restoreAllMocks();
});

/**
 * A live process other than the test process; killed after the test. Spawned
 * outside the temp project — a child whose cwd is inside it would block
 * Windows temp-dir cleanup while the kill is still in flight.
 */
function livePid(): number {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: originalCwd,
  });
  children.push(child);
  if (child.pid === undefined) throw new Error("spawn yielded no pid");
  return child.pid;
}

/**
 * Temp project with the given tree, made the working directory — the
 * wrapper resolves everything from cwd, matching where Next evaluates the
 * config (spike-#1 census).
 */
function makeProject(entries: readonly string[]): string {
  const root = makeTempDir();
  makeTree(root, entries);
  process.chdir(root);
  return root;
}

function settle(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function silenceWarn(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  vi.spyOn(console, "warn").mockImplementation(spy);
  return spy;
}

describe("withTypedRoutes phase dispatch (TR4)", () => {
  it("passes through phases other than build and dev untouched", async () => {
    const root = makeProject(["app/page.tsx"]);
    const config = { pageExtensions: ["tsx"] };
    const result = await withTypedRoutes(config)("phase-export", {});
    expect(result).toBe(config);
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
    expect(devWatcherCountForTests()).toBe(0);
  });

  it("resolves a function-form config, forwarding phase and ctx", async () => {
    makeProject(["app/page.tsx"]);
    const ctx = { defaultConfig: {} };
    const userConfig = vi.fn(() =>
      Promise.resolve({ reactStrictMode: true as const }),
    );
    const result = await withTypedRoutes(userConfig)("phase-test", ctx);
    expect(result).toEqual({ reactStrictMode: true });
    expect(userConfig).toHaveBeenCalledExactlyOnceWith("phase-test", ctx);
  });

  it("resolves a sync (non-async) function-form config on a build phase", async () => {
    const root = makeProject(["app/page.mdx"]);
    silenceWarn();
    const ctx = { defaultConfig: {} };
    const userConfig = vi.fn(() => ({ pageExtensions: ["mdx"] }));
    const result = await withTypedRoutes(userConfig)(PHASE_BUILD, ctx);
    expect(result).toEqual({ pageExtensions: ["mdx"] });
    expect(userConfig).toHaveBeenCalledExactlyOnceWith(PHASE_BUILD, ctx);
    // The resolved config's pageExtensions drove the scan.
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
  });

  it("warns once and skips generation when no app dir exists", async () => {
    const root = makeProject(["src/pages/index.tsx"]);
    const warn = silenceWarn();
    const config = withTypedRoutes({});
    await config(PHASE_DEV, {});
    await config(PHASE_DEV, {});
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
    expect(devWatcherCountForTests()).toBe(0);
    // Two evaluations, one log line (TR5 log-once).
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("no app directory"),
    );
  });
});

describe("withTypedRoutes build phase (TR4)", () => {
  it("generates a missing artifact and warns loudly, listing new paths", async () => {
    const root = makeProject(["app/page.tsx", "app/about/page.tsx"]);
    const warn = silenceWarn();
    await withTypedRoutes({})(PHASE_BUILD, {});
    const artifact = join(root, "paramour-env.d.ts");
    expect(readFileSync(artifact, "utf8")).toBe(emitArtifact(["/", "/about"]));
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("was missing"),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("+ /about"));
    expect(devWatcherCountForTests()).toBe(0);
  });

  it("is silent when the committed artifact is already fresh", async () => {
    const root = makeProject(["app/page.tsx"]);
    writeFileSync(join(root, "paramour-env.d.ts"), emitArtifact(["/"]));
    const warn = silenceWarn();
    await withTypedRoutes({})(PHASE_BUILD, {});
    expect(warn).not.toHaveBeenCalled();
  });

  it("names appeared and disappeared paths in the drift warning", async () => {
    const root = makeProject(["app/page.tsx", "app/new/page.tsx"]);
    writeFileSync(join(root, "paramour-env.d.ts"), emitArtifact(["/", "/old"]));
    const warn = silenceWarn();
    await withTypedRoutes({})(PHASE_BUILD, {});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("out of date"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("+ /new"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("- /old"));
  });

  it("strict: true turns drift into a rejection, after correcting the file", async () => {
    const root = makeProject(["app/page.tsx", "app/new/page.tsx"]);
    writeFileSync(join(root, "paramour-env.d.ts"), emitArtifact(["/", "/old"]));
    await expect(
      withTypedRoutes({}, { strict: true })(PHASE_BUILD, {}),
    ).rejects.toThrow(/out of date/);
    // The build fails but the artifact is left corrected on disk.
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/", "/new"]),
    );
  });

  it("strict: true still resolves when generation itself fails (§7.3: only drift may fail a strict build)", async () => {
    // outFile pointing at an existing DIRECTORY makes the artifact write
    // throw (EISDIR) — an incidental generation failure, not drift.
    makeProject(["app/page.tsx", "artifact-dir/"]);
    const warn = silenceWarn();
    const config = { reactStrictMode: true as const };
    await expect(
      withTypedRoutes(config, { outFile: "artifact-dir", strict: true })(
        PHASE_BUILD,
        {},
      ),
    ).resolves.toBe(config);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("stale route types"),
      expect.anything(),
    );
    expect(devWatcherCountForTests()).toBe(0);
  });

  it("strict: true rejects on a missing artifact, generating it before the throw", async () => {
    const root = makeProject(["app/page.tsx"]);
    const artifact = join(root, "paramour-env.d.ts");
    await expect(
      withTypedRoutes({}, { strict: true })(PHASE_BUILD, {}),
    ).rejects.toThrow(/was missing/);
    // The build fails but the artifact was generated before the throw.
    expect(existsSync(artifact)).toBe(true);
    expect(readFileSync(artifact, "utf8")).toBe(emitArtifact(["/"]));
  });

  it("honors the wrapped config's pageExtensions and the outFile option", async () => {
    const root = makeProject(["app/page.mdx", "app/skipped/page.tsx"]);
    silenceWarn();
    await withTypedRoutes(
      { pageExtensions: ["mdx"] },
      { outFile: join("types", "routes.d.ts") },
    )(PHASE_BUILD, {});
    expect(existsSync(join(root, "paramour-env.d.ts"))).toBe(false);
    expect(readFileSync(join(root, "types", "routes.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
  });
});

describe("withTypedRoutes dev phase (TR4/TR5/TR6)", { retry: 2 }, () => {
  it("generates immediately and starts one watcher across re-evaluations", async () => {
    const root = makeProject(["app/page.tsx"]);
    const config = withTypedRoutes({});
    await config(PHASE_DEV, {});
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
    expect(devWatcherCountForTests()).toBe(1);
    expect(
      readFileSync(
        join(root, "node_modules", ".cache", "paramour", "watcher.lock"),
        "utf8",
      ),
    ).toBe(String(process.pid));
    // Spike-#1 census: Turbopack dev invokes the config function twice in
    // the same process — the singleton must absorb the second call.
    await config(PHASE_DEV, {});
    expect(devWatcherCountForTests()).toBe(1);
  });

  it("continues (config resolves) when dev-phase generation fails", async () => {
    // Same directory-as-artifact trick as the build-phase test: the write
    // throws, dev must keep going in stale-types mode (§7.3).
    makeProject(["app/page.tsx", "artifact-dir/"]);
    const warn = silenceWarn();
    const config = { reactStrictMode: true as const };
    await expect(
      withTypedRoutes(config, { outFile: "artifact-dir" })(PHASE_DEV, {}),
    ).resolves.toBe(config);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("dev continues with stale route types"),
      expect.anything(),
    );
    // Watcher startup itself is unaffected by the failed generation pass.
    expect(devWatcherCountForTests()).toBe(1);
  });

  it("regenerates the artifact when a route folder appears", async () => {
    const root = makeProject(["app/page.tsx"]);
    await withTypedRoutes({})(PHASE_DEV, {});
    await settle(150); // let the platform watcher become active
    makeTree(root, ["app/pricing/page.tsx"]);
    await vi.waitFor(() => {
      expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
        emitArtifact(["/", "/pricing"]),
      );
    }, 5000);
  });

  it("continues (config resolves) when lock acquisition itself throws (§7.3)", async () => {
    const root = makeProject(["app/page.tsx"]);
    // The canonical lock path exists as a DIRECTORY: writing the pidfile
    // throws EISDIR, which must not take down `next dev`.
    mkdirSync(
      join(root, "node_modules", ".cache", "paramour", "watcher.lock"),
      { recursive: true },
    );
    const warn = silenceWarn();
    const config = { reactStrictMode: true as const };
    await expect(withTypedRoutes(config)(PHASE_DEV, {})).resolves.toBe(config);
    // Generation itself succeeded; only the watcher fell into stale-types mode.
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
    expect(devWatcherCountForTests()).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("dev watcher failed"),
      expect.anything(),
    );
  });

  it("declines the watcher when a live process holds the lock, but still generates", async () => {
    const root = makeProject(["app/page.tsx"]);
    const lockPath = join(
      root,
      "node_modules",
      ".cache",
      "paramour",
      "watcher.lock",
    );
    mkdirSync(dirname(lockPath), { recursive: true });
    const owner = livePid();
    writeFileSync(lockPath, String(owner));
    const warn = silenceWarn();
    await withTypedRoutes({})(PHASE_DEV, {});
    expect(readFileSync(join(root, "paramour-env.d.ts"), "utf8")).toBe(
      emitArtifact(["/"]),
    );
    expect(devWatcherCountForTests()).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`watcher already running (pid ${String(owner)})`),
    );
    // Declining must not disturb the owner's lock.
    expect(readFileSync(lockPath, "utf8")).toBe(String(owner));
  });
});
