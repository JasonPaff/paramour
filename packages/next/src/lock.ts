import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Result of {@link acquireWatcherLock}. */
export interface AcquireLockResult {
  /** `false` when a live owner holds the lock — do not start a watcher. */
  acquired: boolean;
  /** The live owner's PID, set only when declined — for the caller's log. */
  ownerPid?: number;
  /**
   * Set only when acquired: remove the lock and deregister the process
   * cleanup handlers. Idempotent; safe to call from the caller's own signal
   * handling.
   */
  release?: () => void;
}

/** Strict anchored PID parse — anything else is a stale/corrupt lock. */
const PID_RE = /^\d+$/;

/**
 * Cross-process single-writer guard (TR6): a best-effort pidfile lock. On
 * startup: read lock → liveness-probe the owner → decline if alive,
 * (over)write and acquire if dead or absent. Deliberately best-effort, not
 * correct — TR3's deterministic write-if-changed output means two live
 * watchers produce identical bytes; imperfect locking costs a log line, not
 * corruption. Hence no flock semantics, atomic-rename dances, or PID-reuse
 * paranoia. The in-process singleton (TR6 guard 1) lives at the composition
 * points, not here.
 */
export function acquireWatcherLock(lockPath: string): AcquireLockResult {
  const ownerPid = readOwnerPid(lockPath);
  if (ownerPid !== undefined && ownerPid !== process.pid && isAlive(ownerPid)) {
    return { acquired: false, ownerPid };
  }
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, String(process.pid));

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    process.removeListener("exit", release);
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    try {
      // Only remove a lock that is still ours — a successor may have taken
      // over after our probe found this process dead (it wasn't).
      if (readOwnerPid(lockPath) === process.pid) {
        rmSync(lockPath, { force: true });
      }
    } catch {
      // Best-effort (TR6): a leftover lock self-heals via the liveness
      // probe on the next startup.
    }
  };
  const reraise = (signal: NodeJS.Signals): void => {
    release();
    // Re-raise so the default termination — or Next's own handlers — still
    // apply; `once` already removed this listener.
    process.kill(process.pid, signal);
  };
  const onSigint = (): void => {
    reraise("SIGINT");
  };
  const onSigterm = (): void => {
    reraise("SIGTERM");
  };
  process.once("exit", release);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return { acquired: true, release };
}

/**
 * The one canonical pidfile location (TR6): CLI-vs-wrapper dedupe only works
 * because both paths compute the lock from the same project root.
 */
export function watcherLockPath(projectRoot: string): string {
  return join(
    projectRoot,
    "node_modules",
    ".cache",
    "paramour",
    "watcher.lock",
  );
}

/** `true` when `pid` is a live process (TR6 liveness probe). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but isn't ours to signal — alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The PID in the lock file, or `undefined` when absent/unparseable. */
function readOwnerPid(lockPath: string): number | undefined {
  let content: string;
  try {
    content = readFileSync(lockPath, "utf8");
  } catch {
    return undefined;
  }
  const trimmed = content.trim();
  return PID_RE.test(trimmed) ? Number(trimmed) : undefined;
}
