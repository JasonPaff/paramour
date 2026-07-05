import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { acquireWatcherLock } from "../src";
import { makeTempDir } from "./helpers.js";

const releases: (() => void)[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const release of releases.splice(0)) release();
  for (const child of children.splice(0)) child.kill();
});

/** Acquire and auto-release after the test (keeps process listeners clean). */
function acquire(lockPath: string): ReturnType<typeof acquireWatcherLock> {
  const result = acquireWatcherLock(lockPath);
  if (result.release) releases.push(result.release);
  return result;
}

/** PID of a process that has already exited. */
function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

/** A live process other than the test process; killed after the test. */
function livePid(): number {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  children.push(child);
  if (child.pid === undefined) throw new Error("spawn yielded no pid");
  return child.pid;
}

function tempLockPath(): string {
  return join(makeTempDir(), ".cache", "paramour", "watcher.lock");
}

function writeLock(lockPath: string, content: string): void {
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, content);
}

describe("acquireWatcherLock (TR6)", () => {
  it("acquires a fresh lock, creating parent dirs, and records its PID", () => {
    const lockPath = tempLockPath();
    const result = acquire(lockPath);
    expect(result.acquired).toBe(true);
    expect(result.ownerPid).toBeUndefined();
    expect(readFileSync(lockPath, "utf8")).toBe(String(process.pid));
  });

  it("takes over a stale lock held by a dead PID", () => {
    const lockPath = tempLockPath();
    writeLock(lockPath, String(deadPid()));
    const result = acquire(lockPath);
    expect(result.acquired).toBe(true);
    expect(readFileSync(lockPath, "utf8")).toBe(String(process.pid));
  });

  it("treats an unparseable lock as stale", () => {
    const lockPath = tempLockPath();
    writeLock(lockPath, "not a pid\n");
    expect(acquire(lockPath).acquired).toBe(true);
  });

  it("declines when a live owner holds the lock, reporting its PID", () => {
    const lockPath = tempLockPath();
    const owner = livePid();
    writeLock(lockPath, String(owner));
    const result = acquire(lockPath);
    expect(result.acquired).toBe(false);
    expect(result.ownerPid).toBe(owner);
    expect(result.release).toBeUndefined();
    // Declining must not disturb the owner's lock.
    expect(readFileSync(lockPath, "utf8")).toBe(String(owner));
  });

  it("re-acquires its own lock (idempotent across restarts of the guard)", () => {
    const lockPath = tempLockPath();
    writeLock(lockPath, String(process.pid));
    expect(acquire(lockPath).acquired).toBe(true);
  });

  it("release() removes the lock and is safe to call twice", () => {
    const lockPath = tempLockPath();
    const { release } = acquire(lockPath);
    expect(release).toBeDefined();
    release?.();
    expect(existsSync(lockPath)).toBe(false);
    release?.();
  });

  it("release() leaves a successor's lock in place", () => {
    const lockPath = tempLockPath();
    const { release } = acquire(lockPath);
    // A successor took over (e.g. our liveness probe raced): not ours to remove.
    const successor = String(deadPid());
    writeFileSync(lockPath, successor);
    release?.();
    expect(readFileSync(lockPath, "utf8")).toBe(successor);
  });

  it("registers cleanup listeners on acquire and removes them on release", () => {
    const before = {
      exit: process.listenerCount("exit"),
      sigint: process.listenerCount("SIGINT"),
      sigterm: process.listenerCount("SIGTERM"),
    };
    const { release } = acquire(tempLockPath());
    expect(process.listenerCount("exit")).toBe(before.exit + 1);
    expect(process.listenerCount("SIGINT")).toBe(before.sigint + 1);
    expect(process.listenerCount("SIGTERM")).toBe(before.sigterm + 1);
    release?.();
    expect(process.listenerCount("exit")).toBe(before.exit);
    expect(process.listenerCount("SIGINT")).toBe(before.sigint);
    expect(process.listenerCount("SIGTERM")).toBe(before.sigterm);
  });

  it("does not add listeners when declining", () => {
    const lockPath = tempLockPath();
    writeLock(lockPath, String(livePid()));
    const before = process.listenerCount("exit");
    acquire(lockPath);
    expect(process.listenerCount("exit")).toBe(before);
  });
});
