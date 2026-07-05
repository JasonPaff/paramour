import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

/**
 * Fresh directory under the OS tmpdir, removed automatically after the test.
 * Fixture trees are built programmatically rather than committed: the scanner
 * only reads names, and committed dirs like `[id]`/`(group)`/`@slot` would
 * need prettier/eslint/tsconfig ignore carve-outs.
 */
export function makeTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "paramour-next-"));
  roots.push(root);
  return root;
}

/**
 * Create the given entries under `root`. Entries are POSIX-style relative
 * paths; a trailing `/` creates an (empty) directory, anything else a
 * zero-byte file with parents created as needed.
 */
export function makeTree(root: string, entries: readonly string[]): void {
  for (const entry of entries) {
    const abs = join(root, ...entry.split("/"));
    if (entry.endsWith("/")) {
      mkdirSync(abs, { recursive: true });
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "");
  }
}
