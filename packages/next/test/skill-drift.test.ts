/**
 * Skill-content drift check: the bundled agent skill republishes load-bearing
 * facts — barrel exports, CLI flags, `p.*` builders, config fields, wire-rule
 * IDs, version floors — and this test pins each of them to its source of
 * truth, in the same spirit as core's `wire-spec-publication.test.ts`. The
 * reads across package boundaries (core's barrel, the docs wire-format page)
 * are deliberate: cross-checking those files IS this test's purpose.
 *
 * Extraction conventions (documented as HTML comments in the skill files):
 * facts live in markdown tables and are cited as single backtick tokens
 * (`name` or `name(...)`); prose spans cite nothing. Every extractor throws
 * on "found nothing", so a structural rewrite of a skill file fails loudly
 * instead of passing vacuously.
 *
 * Deliberately out of scope: the modifier-chain legality lists in
 * authoring.md (type-state, pinned by the tstyche suites, not enumerable
 * from the `p` object) and init's verbatim status strings (too brittle to
 * pin; the flag list and step list are pinned instead).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { p } from "paramour";
import { describe, expect, it } from "vitest";

import { DOCTOR_OPTIONS } from "../src/commands/doctor.js";
import { CHECK_OPTIONS, GENERATE_OPTIONS } from "../src/commands/generate.js";
import { INIT_OPTIONS } from "../src/commands/init.js";
import { LIST_OPTIONS } from "../src/commands/list.js";
import { SKILLS_OPTIONS } from "../src/commands/skills.js";
import { PARAMOUR_CONFIG_KEYS } from "../src/config.js";
import { COMMANDS } from "../src/run-cli.js";
import { loadPackagedSkill } from "../src/skills/packaged.js";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const packaged = loadPackagedSkill();

function backtickSpans(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((span): span is string => span !== undefined);
}

/** The `## `-headed slice of a markdown file, up to the next `## `. */
function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex(
    (line) => line.startsWith("## ") && line.includes(heading),
  );
  if (start === -1) throw new Error(`no "## …${heading}…" section found`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index]?.startsWith("## ") === true) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** A renamed reference file must fail loudly, not silently check nothing. */
function skillFile(relPath: string): string {
  const file = packaged.files.find((entry) => entry.relPath === relPath);
  if (file === undefined) {
    throw new Error(
      `bundled skill has no ${relPath} — update skill-drift.test.ts`,
    );
  }
  return file.content;
}

/** Data rows of the section's markdown table, split into trimmed cells. */
function tableRows(sectionText: string): string[][] {
  const rows = sectionText
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .filter((line) => !/^[\s:|-]+$/.test(line))
    // Split on unescaped pipes only — `\|` inside a cell stays in the cell.
    .map((line) =>
      line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  if (rows.length < 2) throw new Error("markdown table not found or empty");
  return rows.slice(1);
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/**
 * The export name(s) a backtick span cites: a bare identifier, an
 * identifier immediately followed by its call signature (`name(...)`), or —
 * only where a column's convention says so (`commaList`) — a comma-separated
 * identifier list (the error-class row). Everything else (`options: {…}`
 * option shapes, flag spans, prose) cites nothing.
 */
function citedExports(span: string, commaList = false): string[] {
  if (IDENT.test(span)) return [span];
  const call = /^([A-Za-z_$][\w$]*)\(/.exec(span);
  const callee = call?.[1];
  if (callee !== undefined) return [callee];
  if (commaList && /^[A-Za-z_$][\w$]*(?:,\s*[A-Za-z_$][\w$]*)+$/.test(span)) {
    return span.split(",").map((name) => name.trim());
  }
  return [];
}

function missingFrom(
  names: Iterable<string>,
  covered: ReadonlySet<string>,
): string[] {
  return [...names].filter((name) => !covered.has(name)).sort();
}

/**
 * Exported names of a source module, from its text rather than a runtime
 * import — text enumerates type-only exports (invisible at runtime) with the
 * same mechanism as values, and never trips vitest's next-absent alias on
 * the hook entry points. Handles exactly the syntax the target files use:
 * brace re-export lists with inline `type` markers, and direct
 * function/const/class/interface/type declarations.
 */
function parseModuleExports(source: string): {
  types: Set<string>;
  values: Set<string>;
} {
  const types = new Set<string>();
  const values = new Set<string>();
  for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
    const listIsType = match[1] !== undefined;
    for (const raw of (match[2] ?? "").split(",")) {
      const spec = raw.trim();
      if (spec === "") continue;
      const isType = listIsType || spec.startsWith("type ");
      const name = (isType && spec.startsWith("type ") ? spec.slice(5) : spec)
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (name === undefined || name === "") continue;
      (isType ? types : values).add(name);
    }
  }
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?function\s+(\w+)/g,
  )) {
    if (match[1] !== undefined) values.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:class|const)\s+(\w+)/g)) {
    if (match[1] !== undefined) values.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:interface|type)\s+(\w+)/g)) {
    if (match[1] !== undefined) types.add(match[1]);
  }
  return { types, values };
}

const referenceMd = skillFile("references/reference.md");
const authoringMd = skillFile("references/authoring.md");
const setupMd = skillFile("references/setup.md");

describe("skill drift: wire rule IDs", () => {
  // Same families and precedence as wire-spec-publication.test.ts; the
  // conformance file's C* case numbering is deliberately not matched.
  const RULE_ID = /\b(?:SS|CV|PP|[SPDR])\d+\b/g;
  const cited = new Set(referenceMd.match(RULE_ID) ?? []);
  const published = new Set(
    [
      ...read("../../../docs/content/docs/reference/wire-format.mdx").matchAll(
        /<Rule id="([^"]+)"/g,
      ),
    ]
      .map((match) => match[1])
      .filter((id): id is string => id !== undefined),
  );

  it("cites at least one rule per numbered family", () => {
    // Extraction guard. The SS and CV rows summarize their families without
    // numbered citations (their rules are largely definition-time), so the
    // guard covers the five families the summary table numbers.
    for (const family of ["S", "P", "D", "PP", "R"]) {
      expect(
        [...cited].some((id) => new RegExp(`^${family}\\d+$`).test(id)),
        `no cited rules found for family ${family}`,
      ).toBe(true);
    }
  });

  it("every cited rule ID is published on the wire-format page", () => {
    // One direction only, by design: reference.md is a summary, not a
    // republication — publication completeness is wire-spec-publication's.
    expect(missingFrom(cited, published)).toEqual([]);
  });
});

describe("skill drift: `paramour` barrel exports", () => {
  const barrel = parseModuleExports(read("../../core/src/index.ts"));
  const barrelSection = section(referenceMd, "`paramour` barrel exports");
  const rows = tableRows(barrelSection);

  const documentedValues = new Set(
    rows.flatMap((row) =>
      backtickSpans(row[0] ?? "").flatMap((span) => citedExports(span, true)),
    ),
  );

  it("documents every runtime value the barrel exports", () => {
    expect(missingFrom(barrel.values, documentedValues)).toEqual([]);
  });

  it("documents no runtime value the barrel does not export", () => {
    expect(missingFrom(documentedValues, barrel.values)).toEqual([]);
  });

  const keyTypesLine = barrelSection
    .split("\n")
    .find((line) => line.startsWith("Key types:"));
  if (keyTypesLine === undefined) {
    throw new Error('reference.md lost its "Key types:" paragraph');
  }
  const typeTokens = backtickSpans(keyTypesLine);
  const literalTypes = new Set(typeTokens.filter((token) => IDENT.test(token)));
  // Two wildcard tokens the paragraph uses instead of enumerating: the
  // registry-augmentation family, and the `*Input` sync-accepting twins of
  // types it already cites literally (tight on purpose — a future FooInput
  // with no cited Foo is NOT silently covered).
  const registeredWildcard = typeTokens.includes("Registered*RoutePaths");
  const inputWildcard = typeTokens.includes("*Input");
  const isCovered = (name: string): boolean =>
    literalTypes.has(name) ||
    (registeredWildcard && /^Registered\w*RoutePaths$/.test(name)) ||
    (inputWildcard &&
      name.endsWith("Input") &&
      literalTypes.has(name.slice(0, -"Input".length)));

  it("lists every type the barrel exports (wildcards expanded)", () => {
    expect([...barrel.types].filter((name) => !isCovered(name)).sort()).toEqual(
      [],
    );
  });

  it("lists no type the barrel does not export", () => {
    expect(missingFrom(literalTypes, barrel.types)).toEqual([]);
  });
});

describe("skill drift: `@paramour-js/next` entry points", () => {
  const rows = tableRows(section(referenceMd, "`@paramour-js/next` exports"));
  const rowByEntry = new Map(
    rows.map((row) => {
      const entry = backtickSpans(row[0] ?? "")[0];
      if (entry === undefined) throw new Error("entry-point row lost its name");
      return [entry, row[1] ?? ""];
    }),
  );

  it("has one row per package.json entry point", () => {
    const packageJson = JSON.parse(read("../package.json")) as {
      exports: Record<string, unknown>;
    };
    const entries = Object.keys(packageJson.exports)
      .map((key) => `@paramour-js/next${key === "." ? "" : key.slice(1)}`)
      .sort();
    expect([...rowByEntry.keys()].sort()).toEqual(entries);
  });

  /**
   * Spans in a row that name a `paramour` export for context rather than an
   * export of the entry point itself. Anti-rot-checked below.
   */
  const CROSS_REFERENCES: Record<string, readonly string[]> = {
    "@paramour-js/next/pages": ["SafeResult"],
  };

  const ENTRY_FILES: Record<string, string> = {
    "@paramour-js/next": "../src/index.ts",
    "@paramour-js/next/app": "../src/app.ts",
    "@paramour-js/next/pages": "../src/pages.ts",
    "@paramour-js/next/testing": "../src/testing.tsx",
  };

  const citedIn = (entry: string): Set<string> => {
    const noise = new Set(CROSS_REFERENCES[entry] ?? []);
    return new Set(
      backtickSpans(rowByEntry.get(entry) ?? "")
        .flatMap((span) => citedExports(span))
        .filter((name) => !noise.has(name)),
    );
  };

  for (const [entry, file] of Object.entries(ENTRY_FILES)) {
    it(`documents exactly the exports of ${entry}`, () => {
      const exported = parseModuleExports(read(file));
      const actual = new Set([...exported.values, ...exported.types]);
      const cited = citedIn(entry);
      expect(missingFrom(actual, cited), `${entry}: undocumented`).toEqual([]);
      expect(missingFrom(cited, actual), `${entry}: stale`).toEqual([]);
    });
  }

  it("keeps the types-only devtools-seam row enumerating nothing", () => {
    // The seam's exports map has no runtime condition and the row
    // deliberately points consumers at @paramour-js/devtools instead —
    // naming seam exports here means wiring a real check first.
    expect(citedIn("@paramour-js/next/devtools-seam")).toEqual(new Set());
  });

  it("cross-reference entries stay present and stay non-exports", () => {
    const stale = Object.entries(CROSS_REFERENCES)
      .flatMap(([entry, names]) => {
        const row = rowByEntry.get(entry) ?? "";
        const file = ENTRY_FILES[entry];
        if (file === undefined) return names.map((name) => `${entry}:${name}`);
        const exported = parseModuleExports(read(file));
        return names
          .filter(
            (name) =>
              !backtickSpans(row).includes(name) ||
              exported.values.has(name) ||
              exported.types.has(name),
          )
          .map((name) => `${entry}:${name}`);
      })
      .sort();
    expect(stale).toEqual([]);
  });
});

describe("skill drift: CLI commands and flags", () => {
  const optionFlags = (options: Record<string, unknown>): string[] =>
    Object.keys(options)
      .filter((key) => key !== "help")
      .map((key) => `--${key}`)
      .sort();

  // Alphabetical, and pinned to the dispatcher below so a new command
  // cannot dodge this table.
  const SOURCE_FLAGS: Record<string, readonly string[]> = {
    check: optionFlags(CHECK_OPTIONS),
    doctor: optionFlags(DOCTOR_OPTIONS),
    generate: optionFlags(GENERATE_OPTIONS),
    init: optionFlags(INIT_OPTIONS),
    list: optionFlags(LIST_OPTIONS),
    skills: optionFlags(SKILLS_OPTIONS),
  };

  it("covers exactly the dispatcher's command roster", () => {
    expect(Object.keys(SOURCE_FLAGS).sort()).toEqual(
      Object.keys(COMMANDS).sort(),
    );
  });

  const rows = tableRows(section(referenceMd, "CLI ("));
  const flagsByCommand = new Map(
    rows.map((row) => {
      const command = backtickSpans(row[0] ?? "")[0];
      if (command === undefined) throw new Error("CLI row lost its command");
      // `--help`/`-h` is stated once below the table, not per row.
      return [
        command,
        [...(row[2] ?? "").matchAll(/--[a-z][a-z-]*/g)]
          .map((match) => match[0])
          .sort(),
      ];
    }),
  );

  it("documents every command", () => {
    expect([...flagsByCommand.keys()].sort()).toEqual(
      Object.keys(SOURCE_FLAGS).sort(),
    );
  });

  for (const [command, flags] of Object.entries(SOURCE_FLAGS)) {
    it(`documents exactly the flags of \`paramour ${command}\``, () => {
      expect(flagsByCommand.get(command) ?? []).toEqual(flags);
    });
  }

  it("setup.md's init flag list matches the init options", () => {
    const flagsLine = setupMd
      .split("\n")
      .find((line) => line.startsWith("Flags:"));
    if (flagsLine === undefined) {
      throw new Error('setup.md lost its init "Flags:" line');
    }
    const documented = [...flagsLine.matchAll(/--[a-z][a-z-]*/g)]
      .map((match) => match[0])
      .filter((flag) => flag !== "--help")
      .sort();
    expect(documented).toEqual(optionFlags(INIT_OPTIONS));
  });
});

describe("skill drift: p.* builder roster", () => {
  const builders = Object.keys(p).sort();

  it("authoring.md's builder table matches Object.keys(p)", () => {
    const rows = tableRows(section(authoringMd, "`p.*` codec builders"));
    const documented = rows
      .map((row) => {
        const span = backtickSpans(row[0] ?? "")[0] ?? "";
        const match = /^p\.(\w+)\(/.exec(span);
        if (match?.[1] === undefined) {
          throw new Error(`builder row cell is not a p.*(…) span: "${span}"`);
        }
        return match[1];
      })
      .sort();
    expect(documented).toEqual(builders);
  });

  it("reference.md's `p` row lists every builder", () => {
    const rows = tableRows(section(referenceMd, "`paramour` barrel exports"));
    const pRow = rows.find((row) => (row[0] ?? "") === "`p`");
    if (pRow === undefined) throw new Error("reference.md lost its `p` row");
    const list = backtickSpans(pRow[1] ?? "").find((span) =>
      span.includes(","),
    );
    if (list === undefined) {
      throw new Error("`p` row lost its comma-separated builder list");
    }
    expect(
      list
        .split(",")
        .map((name) => name.trim())
        .sort(),
    ).toEqual(builders);
  });
});

describe("skill drift: config fields", () => {
  it("reference.md's config table matches ParamourConfig", () => {
    const rows = tableRows(section(referenceMd, "paramour.config"));
    const documented = rows
      .map((row) => {
        const field = backtickSpans(row[0] ?? "")[0];
        if (field === undefined) throw new Error("config row lost its field");
        return field;
      })
      .sort();
    expect(documented).toEqual([...PARAMOUR_CONFIG_KEYS].sort());
  });
});

describe("skill drift: version and engine claims", () => {
  const packageJson = JSON.parse(read("../package.json")) as {
    engines: Record<string, string>;
    peerDependencies: Record<string, string>;
  };

  /** The single occurrence the claim regex must have in setup.md. */
  const claimed = (pattern: RegExp): string => {
    const matches = [...setupMd.matchAll(new RegExp(pattern, "g"))];
    const value = matches[0]?.[1];
    if (matches.length !== 1 || value === undefined) {
      throw new Error(
        `expected exactly one match for ${String(pattern)} in setup.md`,
      );
    }
    return value;
  };

  /** `18.2` ≡ `18.2.0`: dot-split, zero-pad, numeric compare. */
  const sameVersion = (a: string, b: string): boolean => {
    const [left, right] = [a.split("."), b.split(".")];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
      if (Number(left[index] ?? "0") !== Number(right[index] ?? "0")) {
        return false;
      }
    }
    return true;
  };

  const cases: [claim: RegExp, range: string][] = [
    [/`next >= ([\d.]+)`/, packageJson.peerDependencies.next ?? ""],
    [/`react >= ([\d.]+)`/, packageJson.peerDependencies.react ?? ""],
    [/Node `>= ([\d.]+)`/, packageJson.engines.node ?? ""],
  ];

  for (const [claim, range] of cases) {
    it(`setup.md's ${String(claim)} claim matches package.json`, () => {
      // The claim's wording is only true of a `>=` range — a caret/tilde
      // change must fail here, not silently satisfy the number.
      expect(range.startsWith(">="), `range "${range}" is not >=-shaped`).toBe(
        true,
      );
      expect(sameVersion(claimed(claim), range.slice(2))).toBe(true);
    });
  }
});
