import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type RouteDirsWatcher, watchRouteDirs } from "../src/watch.js";
import { makeTempDir, makeTree } from "./helpers.js";

/**
 * Native fs events are async and platform-lagged, so these tests poll with
 * `vi.waitFor` for positive assertions and use a real settle delay for
 * negative ones; the whole suite retries because CI runners can be slow to
 * deliver events. The Linux (`ubuntu-latest`) CI run doubles as design-05
 * spike 2's `fs.watch({ recursive })` observation.
 */

const DEBOUNCE_MS = 50;
/** Long enough for a debounce to have fired if an event was seen. */
const SETTLE_MS = 300;

const watchers: RouteDirsWatcher[] = [];

afterEach(() => {
  for (const watcher of watchers.splice(0)) watcher.close();
});

async function expectRescan(onRescan: ReturnType<typeof vi.fn>): Promise<void> {
  await vi.waitFor(() => {
    expect(onRescan).toHaveBeenCalled();
  }, 5000);
}

function settle(ms = SETTLE_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Start a watcher (auto-closed after the test) and let it spin up. */
async function startWatcher(
  dirs: readonly string[],
  options: Partial<Parameters<typeof watchRouteDirs>[1]> = {},
): Promise<{
  onError: ReturnType<typeof vi.fn>;
  onRescan: ReturnType<typeof vi.fn>;
}> {
  const onError = vi.fn();
  const onRescan = vi.fn();
  const watcher = watchRouteDirs(dirs, {
    debounceMs: DEBOUNCE_MS,
    onError,
    onRescan,
    ...options,
  });
  watchers.push(watcher);
  // Give the platform watcher a beat to become active before events fire.
  await settle(100);
  return { onError, onRescan };
}

describe("watchRouteDirs (TR5/PR8)", { retry: 2 }, () => {
  it("fires a rescan when a file appears under the app dir", async () => {
    const appDir = makeTempDir();
    const { onRescan } = await startWatcher([appDir]);
    writeFileSync(join(appDir, "page.tsx"), "");
    await expectRescan(onRescan);
  });

  it("watches both route dirs of a hybrid project (PR8)", async () => {
    const root = makeTempDir();
    makeTree(root, ["app/", "pages/"]);
    const { onRescan } = await startWatcher([
      join(root, "app"),
      join(root, "pages"),
    ]);
    writeFileSync(join(root, "pages", "legacy.tsx"), "");
    await expectRescan(onRescan);
    onRescan.mockClear();
    writeFileSync(join(root, "app", "page.tsx"), "");
    await expectRescan(onRescan);
  });

  it("coalesces an event storm into a single rescan", async () => {
    const appDir = makeTempDir();
    const { onRescan } = await startWatcher([appDir], { debounceMs: 150 });
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(appDir, `file-${String(i)}.tsx`), "");
    }
    await expectRescan(onRescan);
    await settle();
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it("shares one debounce across dirs: a burst touching both rescans once", async () => {
    const root = makeTempDir();
    makeTree(root, ["app/", "pages/"]);
    const { onRescan } = await startWatcher(
      [join(root, "app"), join(root, "pages")],
      { debounceMs: 150 },
    );
    writeFileSync(join(root, "app", "page.tsx"), "");
    writeFileSync(join(root, "pages", "legacy.tsx"), "");
    await expectRescan(onRescan);
    await settle();
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it("sees events in nested subdirectories (recursive)", async () => {
    const appDir = makeTempDir();
    makeTree(appDir, ["products/[id]/"]);
    const { onRescan } = await startWatcher([appDir]);
    writeFileSync(join(appDir, "products", "[id]", "page.tsx"), "");
    await expectRescan(onRescan);
  });

  it("ignores events for the artifact path (feedback loop)", async () => {
    const appDir = makeTempDir();
    const artifact = join(appDir, "paramour-env.d.ts");
    const { onRescan } = await startWatcher([appDir], {
      ignorePaths: [artifact],
    });
    writeFileSync(artifact, "// generated");
    await settle();
    expect(onRescan).not.toHaveBeenCalled();
  });

  it("ignores node_modules and .next subtrees", async () => {
    const appDir = makeTempDir();
    makeTree(appDir, [".next/", "node_modules/"]);
    const { onRescan } = await startWatcher([appDir]);
    writeFileSync(join(appDir, "node_modules", "dep.js"), "");
    writeFileSync(join(appDir, ".next", "trace.json"), "");
    await settle();
    expect(onRescan).not.toHaveBeenCalled();
  });

  it("routes a throwing onRescan to onError and stays alive", async () => {
    const appDir = makeTempDir();
    const boom = new Error("regenerate failed");
    const { onError, onRescan } = await startWatcher([appDir]);
    onRescan.mockImplementationOnce(() => {
      throw boom;
    });
    writeFileSync(join(appDir, "one.tsx"), "");
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(boom);
    }, 5000);
    // Still watching: a later event fires a second (non-throwing) rescan.
    writeFileSync(join(appDir, "two.tsx"), "");
    await vi.waitFor(() => {
      expect(onRescan).toHaveBeenCalledTimes(2);
    }, 5000);
  });

  it("stops delivering rescans after close(), and double-close is safe", async () => {
    const appDir = makeTempDir();
    const onRescan = vi.fn();
    const watcher = watchRouteDirs([appDir], {
      debounceMs: DEBOUNCE_MS,
      onRescan,
    });
    await settle(100);
    watcher.close();
    watcher.close();
    writeFileSync(join(appDir, "page.tsx"), "");
    await settle();
    expect(onRescan).not.toHaveBeenCalled();
  });

  it("close() drops a pending debounced rescan", async () => {
    const appDir = makeTempDir();
    const onRescan = vi.fn();
    // A debounce window long enough that the FS event lands well before it
    // elapses, so close() races only the timer, not event delivery.
    const watcher = watchRouteDirs([appDir], { debounceMs: 1000, onRescan });
    watchers.push(watcher);
    await settle(100);
    writeFileSync(join(appDir, "page.tsx"), "");
    // Let the platform deliver the event (scheduling the debounce timer),
    // then close before the window elapses.
    await settle();
    watcher.close();
    await settle(1200);
    expect(onRescan).not.toHaveBeenCalled();
  });

  it("skips a missing dir silently — not watched, not an error (PR8)", async () => {
    // Callers pass what discovery resolved; a dir gone by watch time is a
    // raced deletion and dev continues in stale-types mode (TR5). The
    // present dir still watches.
    const root = makeTempDir();
    makeTree(root, ["app/"]);
    const missing = join(root, "pages-does-not-exist");
    const { onError, onRescan } = await startWatcher([
      join(root, "app"),
      missing,
    ]);
    expect(onError).not.toHaveBeenCalled();
    writeFileSync(join(root, "app", "page.tsx"), "");
    await expectRescan(onRescan);
  });

  it("watches nothing (and reports nothing) when every dir is missing", () => {
    const missing = join(makeTempDir(), "does-not-exist");
    const onError = vi.fn();
    const onRescan = vi.fn();
    const watcher = watchRouteDirs([missing], { onError, onRescan });
    watchers.push(watcher);
    expect(onError).not.toHaveBeenCalled();
    // The no-op handle is still closeable.
    watcher.close();
  });

  it("filters chains: an ignored dir created at watch time never rescans", async () => {
    const appDir = makeTempDir();
    const { onRescan } = await startWatcher([appDir]);
    // Creating the ignored dir itself is also an ignored event.
    mkdirSync(join(appDir, "node_modules"));
    await settle();
    expect(onRescan).not.toHaveBeenCalled();
  });
});
