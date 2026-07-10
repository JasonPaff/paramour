import { type FSWatcher, statSync, watch } from "node:fs";
import { resolve } from "node:path";

/** Handle returned by {@link watchRouteDirs}. */
export interface RouteDirsWatcher {
  /** Stop watching and drop any pending debounced rescan. Idempotent. */
  close(): void;
}

/** Options for {@link watchRouteDirs}. */
export interface WatchRouteDirsOptions {
  /** Debounce window in milliseconds; defaults to {@link DEFAULT_DEBOUNCE_MS}. */
  debounceMs?: number;
  /**
   * Absolute paths whose events are ignored — the artifact file, so a
   * regeneration write can't re-trigger the watcher (TR5 feedback loop).
   */
  ignorePaths?: readonly string[];
  /**
   * Watcher startup/runtime failures and `onRescan` throws land here.
   * Surfaced, not logged: TR5's "log once, dev continues" behavior belongs
   * to the composition points (TR4/TR7), not this module.
   */
  onError?: (error: unknown) => void;
  /** The regenerate callback — full rescan → write-if-changed (TR5). */
  onRescan: () => void;
}

/** TR5: ~100 ms — long enough to coalesce an editor save storm. */
export const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Directory names whose subtrees are ignored if they ever fall under a
 * watched root (TR5).
 */
const IGNORED_SEGMENTS = new Set([".next", "node_modules"]);

/**
 * Debounced full-rescan watcher over the route dirs — both of them in a
 * hybrid project (PR8), sharing one debounce so an editor operation touching
 * both coalesces into a single rescan. Because a scan is milliseconds (TR2),
 * no event fidelity is needed: any event → debounce → `onRescan`. Native
 * `fs.watch({ recursive: true })`, no chokidar; this start/close interface
 * is the seam chokidar would drop in behind if a platform hole appears.
 *
 * A missing dir is skipped — not watched, not an error (PR8): callers pass
 * the dirs discovery resolved, so absence here is a raced deletion, and dev
 * continuing in stale-types mode is exactly TR5's posture. Genuine watch
 * startup failures still surface through `onError`.
 */
export function watchRouteDirs(
  dirs: readonly string[],
  options: WatchRouteDirsOptions,
): RouteDirsWatcher {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    ignorePaths = [],
    onError,
    onRescan,
  } = options;
  const ignored = new Set(ignorePaths.map((path) => resolve(path)));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        onRescan();
      } catch (error) {
        // A throwing regeneration must not kill the watcher (TR5 non-fatal).
        onError?.(error);
      }
    }, debounceMs);
  };

  const watchers: FSWatcher[] = [];
  for (const dir of dirs) {
    let watcher: FSWatcher;
    try {
      // Linux's userland recursive watcher (Node <= 24.18.0,
      // internal/fs/recursive_watch.js) swallows ENOENT under the default
      // throwIfNoEntry — a missing dir silently never watches, with no throw
      // and no 'error' event. Stat first so the missing-dir skip is
      // synchronous and identical on every platform.
      if (statSync(dir, { throwIfNoEntry: false }) === undefined) continue;
      watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
        // `filename` can be null (platform-dependent); with nothing to
        // filter on, err toward rescanning — a spurious pass is a no-op
        // write (TR3).
        if (filename !== null) {
          if (ignored.has(resolve(dir, filename))) return;
          // Windows reports backslash-joined relative paths; split on both.
          const segments = filename.split(/[/\\]/);
          if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return;
        }
        schedule();
      });
    } catch (error) {
      // TR5: watcher failure is non-fatal — dev continues in stale-types
      // mode, and the other dir's watcher (if any) keeps running.
      onError?.(error);
      continue;
    }
    watcher.on("error", (error) => {
      onError?.(error);
    });
    watchers.push(watcher);
  }

  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}
