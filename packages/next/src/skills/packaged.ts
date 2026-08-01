import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { hashContent } from "./manifest.js";

/** One file of the bundled skill, hashed and ready to install. */
export interface PackagedFile {
  content: string;
  hash: string;
  /** POSIX-relative to the skill root, e.g. `references/setup.md`. */
  relPath: string;
}

/** The bundled skill as shipped in this package's `skills/` directory. */
export interface PackagedSkill {
  files: readonly PackagedFile[];
  /** This package's own version — the value stamped into manifests. */
  version: string;
}

// Two levels up is the package root from both `src/skills/` (vitest runs
// the sources) and `dist/skills/` (the built CLI): tsc mirrors src/ into
// dist/ at the same depth, so one relative URL serves both worlds.
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Load the bundled skill content. Hashes are computed here, at read time,
 * never committed — the changesets release flow bumps versions without a
 * build step, so any committed hash would go stale on the first release.
 * Throws when the bundled content is unreadable (an operational error: the
 * package itself is broken).
 */
export function loadPackagedSkill(): PackagedSkill {
  const root = join(PACKAGE_ROOT, "skills", "paramour");
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const content = readFileSync(join(entry.parentPath, entry.name), "utf8");
      return {
        content,
        hash: hashContent(content),
        relPath: relative(root, join(entry.parentPath, entry.name)).replaceAll(
          "\\",
          "/",
        ),
      };
    })
    // Byte-order, not localeCompare — locale collation varies by machine.
    .sort((a, b) =>
      a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
    );
  const manifest = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
  ) as { version: string };
  return { files, version: manifest.version };
}
