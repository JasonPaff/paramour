// Diagnostic-diff harness for the negative suite.
//
// Contract: every `// @expect-error TSxxxx [TSyyyy ...] — reason` marker
// annotates the next non-blank, non-comment line, and tsc must report
// exactly those diagnostics (per file:line:code, column ignored) — no
// missing, no unexpected. Exit 0 on exact match, 1 on any mismatch,
// 2 on tooling/self-check failure.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const SKIP_DIRS = new Set([".next", "dist", "node_modules", "scripts"]);
const MARKER_RE =
  /^\s*\/\/\s*@expect-error\s+(TS\d+(?:\s+TS\d+)*)\b(?:\s+[—–-].*)?$/;
const FULL_LINE_COMMENT_RE = /^\s*\/\//;
const DIAGNOSTIC_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const GLOBAL_DIAGNOSTIC_RE = /^error (TS\d+): (.*)$/;

function fail(exitCode, message) {
  console.error(`type-errors: ${message}`);
  process.exit(exitCode);
}

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

// --- collect markers ------------------------------------------------------

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (/\.tsx?$/.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

/** @returns {Map<string, {count: number, sourceLine: number}>} multiset keyed "relPath:line:code" */
function collectExpected() {
  const expected = new Map();
  for (const file of walk(exampleRoot)) {
    const relPath = toPosix(relative(exampleRoot, file));
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const marker = MARKER_RE.exec(lines[i]);
      if (!marker) continue;
      // The marker annotates the next non-blank, non-comment line. A second
      // stacked marker before a code line is a harness authoring error.
      let target = i + 1;
      while (target < lines.length) {
        const line = lines[target];
        if (MARKER_RE.test(line)) {
          fail(
            2,
            `${relPath}:${target + 1}: stacked @expect-error markers — put all codes on one marker`,
          );
        }
        if (line.trim() !== "" && !FULL_LINE_COMMENT_RE.test(line)) break;
        target++;
      }
      if (target >= lines.length) {
        fail(
          2,
          `${relPath}:${i + 1}: @expect-error marker has no following code line`,
        );
      }
      for (const code of marker[1].split(/\s+/)) {
        const key = `${relPath}:${target + 1}:${code}`;
        const entry = expected.get(key) ?? { count: 0, sourceLine: i + 1 };
        entry.count++;
        expected.set(key, entry);
      }
    }
  }
  return expected;
}

// --- run tsc and parse diagnostics ----------------------------------------

function runTsc() {
  const tscJs = join(
    exampleRoot,
    "node_modules",
    "typescript",
    "lib",
    "tsc.js",
  );
  if (!existsSync(tscJs)) {
    fail(2, `tsc not found at ${tscJs} — run pnpm install`);
  }
  const result = spawnSync(
    process.execPath,
    [tscJs, "-p", exampleRoot, "--noEmit", "--pretty", "false"],
    { cwd: exampleRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) {
    fail(2, `failed to spawn tsc: ${result.error.message}`);
  }
  // tsc's exit code is meaningless here (the program is SUPPOSED to fail);
  // the verdict comes from diffing diagnostics against the markers.
  return `${result.stdout}\n${result.stderr}`;
}

/** @returns {{actual: Map<string, {count: number, messages: string[]}>, globals: string[]}} */
function parseDiagnostics(output) {
  const actual = new Map();
  const globals = [];
  for (const line of output.split(/\r?\n/)) {
    const diag = DIAGNOSTIC_RE.exec(line);
    if (diag) {
      // tsc emits cwd-relative paths (cwd is pinned to exampleRoot); resolve
      // + re-relativize so Windows and Linux output compare identically.
      const relPath = toPosix(
        relative(exampleRoot, resolve(exampleRoot, diag[1])),
      );
      const key = `${relPath}:${diag[2]}:${diag[4]}`;
      const entry = actual.get(key) ?? { count: 0, messages: [] };
      entry.count++;
      entry.messages.push(diag[5]);
      actual.set(key, entry);
      continue;
    }
    const global = GLOBAL_DIAGNOSTIC_RE.exec(line);
    if (global) globals.push(line);
    // Everything else (indented related-info lines, "Found N errors") is
    // elaboration, not a new diagnostic — ignored for matching.
  }
  return { actual, globals };
}

// --- match ----------------------------------------------------------------

const expected = collectExpected();
if (expected.size === 0) {
  fail(2, "no @expect-error markers found — the marker scanner is broken");
}

const { actual, globals } = parseDiagnostics(runTsc());

const missing = [];
const unexpected = [];

for (const [key, entry] of expected) {
  const got = actual.get(key)?.count ?? 0;
  for (let i = got; i < entry.count; i++) missing.push(key);
}
for (const [key, entry] of actual) {
  const want = expected.get(key)?.count ?? 0;
  for (let i = want; i < entry.count; i++) {
    unexpected.push(`${key}: ${entry.messages[i] ?? entry.messages[0]}`);
  }
}

const expectedTotal = [...expected.values()].reduce((n, e) => n + e.count, 0);

if (missing.length > 0 || unexpected.length > 0 || globals.length > 0) {
  for (const key of missing) {
    console.error(
      `MISSING    ${key} — expected diagnostic not reported (type-level regression?)`,
    );
  }
  for (const line of unexpected) {
    console.error(`UNEXPECTED ${line}`);
  }
  for (const line of globals) {
    console.error(`UNEXPECTED (global) ${line}`);
  }
  console.error(
    `type-errors: FAIL — ${String(missing.length)} missing, ${String(unexpected.length + globals.length)} unexpected (of ${String(expectedTotal)} expected diagnostics)`,
  );
  process.exit(1);
}

console.log(
  `type-errors: ${String(expectedTotal)} expected diagnostics, all matched; no unexpected diagnostics.`,
);
