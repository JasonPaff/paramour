import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/run-cli.js";
import { linkCorePackage, makeTempDir, makeTree } from "./helpers.js";

/**
 * `paramour list` evaluates fixture modules that `import ... from
 * "paramour"`, so fixtures need a resolvable BUILT core (cli-dist pattern:
 * skipped without a dist locally, always on in CI) and a junction link into
 * each temp project (skipped where even junctions are denied).
 */
const coreDist = fileURLToPath(
  new URL("../../core/dist/index.js", import.meta.url),
);

function canLink(): boolean {
  const probe = mkdtempSync(join(tmpdir(), "paramour-link-probe-"));
  try {
    return linkCorePackage(probe);
  } finally {
    rmSync(probe, { force: true, recursive: true });
  }
}

const runnable = existsSync(coreDist) && canLink();

const originalCwd = process.cwd();
afterEach(() => {
  process.chdir(originalCwd);
});

async function list(
  argv: readonly string[] = [],
): Promise<{ code: number; err: string[]; out: string[] }> {
  const err: string[] = [];
  const out: string[] = [];
  const code = await runCli(["list", ...argv], {
    stderr: (line) => {
      err.push(line);
    },
    stdout: (line) => {
      out.push(line);
    },
  });
  return { code, err, out };
}

/** Temp project with route files, fixture modules, and a linked core. */
function makeProject(
  entries: readonly string[],
  files: Record<string, string> = {},
): string {
  const root = makeTempDir();
  makeTree(root, entries);
  for (const [name, content] of Object.entries(files)) {
    const abs = join(root, ...name.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  if (!linkCorePackage(root)) throw new Error("junction link failed");
  process.chdir(root);
  return root;
}

const KITCHEN_DEFS = `import { defineAppRoute, definePagesRoute, p } from "paramour";

export const product = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    labels: p.csv(p.integer()),
    q: p.string().optional(),
    sort: p.enum(["name", "price"]).default("name"),
    tags: p.stringArray(),
  },
});

export const legacy = definePagesRoute("/legacy/[id]", {
  params: { id: p.string() },
});
`;

describe.skipIf(!runnable)("paramour list", () => {
  it("overlays app and pages shapes onto the filesystem scan", async () => {
    makeProject(
      ["app/page.tsx", "app/product/[id]/page.tsx", "pages/legacy/[id].tsx"],
      { "lib/routes.ts": KITCHEN_DEFS },
    );
    const run = await list();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("app routes (2):");
    expect(text).toContain("pages routes (1):");
    expect(text).toMatch(/\/product\/\[id\]\s+lib\/routes\.ts/);
    expect(text).toContain("id: integer");
    expect(text).toContain("string (optional)");
    expect(text).toContain("enum(name, price) (default: name)");
    expect(text).toContain("string[]");
    expect(text).toContain("labels: csv<integer>");
    // The definition-less route is flagged, not an error.
    expect(text).toMatch(/\/\s+⚠ filesystem only/);
    expect(run.err).toEqual([]);
  });

  it("renders catch-all params, custom labels, and rawSearch", async () => {
    makeProject(["app/docs/[[...slug]]/page.tsx", "app/s/[term]/page.tsx"], {
      "lib/routes.ts": `import { defineAppRoute, p, rawSearch } from "paramour";

// Hand-rolled Standard Schema — fixture projects have no validator dep.
const anySchema = {
  "~standard": { validate: (value) => ({ value }), vendor: "test", version: 1 },
};

export const docs = defineAppRoute("/docs/[[...slug]]", {
  params: { slug: p.string() },
});

export const search = defineAppRoute("/s/[term]", {
  params: {
    term: p.custom({
      label: "slug",
      parse: (raw) => raw,
      serialize: (value) => String(value),
    }),
  },
  search: rawSearch(anySchema),
});
`,
    });
    const run = await list();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("string[] (optional catch-all)");
    expect(text).toContain("term: slug");
    expect(text).toContain("search: (rawSearch schema)");
  });

  it("reports orphan definitions with no filesystem route", async () => {
    makeProject(["app/page.tsx"], {
      "lib/routes.ts": `import { defineAppRoute, p } from "paramour";
export const gone = defineAppRoute("/gone/[id]", { params: { id: p.string() } });
`,
    });
    const run = await list();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("definitions with no filesystem route:");
    expect(text).toContain("⚠ /gone/[id] (app)  lib/routes.ts");
  });

  it("degrades per-module: a throwing module is reported, others still load", async () => {
    makeProject(["app/a/[id]/page.tsx", "app/b/[id]/page.tsx"], {
      "lib/bad.ts": `// defineAppRoute (marker so the scan loads this module)
throw new Error("kaboom");
`,
      "lib/good.ts": `import { defineAppRoute, p } from "paramour";
export const a = defineAppRoute("/a/[id]", { params: { id: p.integer() } });
`,
    });
    const run = await list();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toContain("1 module failed to load");
    expect(text).toMatch(/⚠ lib\/bad\.ts: .*kaboom/);
    expect(text).toContain("id: integer");
    expect(text).toMatch(/\/b\/\[id\]\s+⚠ filesystem only/);
  });

  it("dedupes by (router, path): first file wins, later ones are reported", async () => {
    makeProject(["app/dupe/[id]/page.tsx"], {
      "lib/a-first.ts": `import { defineAppRoute, p } from "paramour";
export const first = defineAppRoute("/dupe/[id]", { params: { id: p.integer() } });
`,
      "lib/b-second.ts": `import { defineAppRoute, p } from "paramour";
export const second = defineAppRoute("/dupe/[id]", { params: { id: p.string() } });
`,
    });
    const run = await list();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    // First (sorted file order) definition supplies the shape...
    expect(text).toContain("id: integer");
    // ...and the loser is called out.
    expect(text).toContain("duplicate definitions (first wins):");
    expect(text).toContain(
      "⚠ /dupe/[id] (app)  lib/b-second.ts (already defined in lib/a-first.ts)",
    );
  });

  it("routeFiles config globs replace the automatic scan", async () => {
    makeProject(["app/one/[id]/page.tsx", "app/two/[id]/page.tsx"], {
      "defs/one.ts": `import { defineAppRoute, p } from "paramour";
export const one = defineAppRoute("/one/[id]", { params: { id: p.integer() } });
`,
      "lib/two.ts": `import { defineAppRoute, p } from "paramour";
export const two = defineAppRoute("/two/[id]", { params: { id: p.integer() } });
`,
      "paramour.config.json": `{ "routeFiles": ["defs/**/*.ts"] }`,
    });
    const run = await list();
    expect(run.code).toBe(0);
    const text = run.out.join("\n");
    expect(text).toMatch(/\/one\/\[id\]\s+defs\/one\.ts/);
    // lib/two.ts is outside the configured globs — never evaluated.
    expect(text).toMatch(/\/two\/\[id\]\s+⚠ filesystem only/);
  });

  it("--json emits the machine-readable report", async () => {
    makeProject(
      ["app/page.tsx", "app/product/[id]/page.tsx", "pages/legacy/[id].tsx"],
      { "lib/routes.ts": KITCHEN_DEFS },
    );
    const run = await list(["--json"]);
    expect(run.code).toBe(0);
    const payload = JSON.parse(run.out.join("\n")) as {
      appRoutes: {
        definition: null | {
          exportName: string;
          file: string;
          params: Record<string, { kind: string; segmentKind: string }>;
          search: { keys?: Record<string, { presence: string }>; kind: string };
        };
        path: string;
      }[];
      duplicates: unknown[];
      loadFailures: unknown[];
      orphanDefinitions: unknown[];
      pagesRoutes: { definition: null | object; path: string }[];
    };
    expect(payload.appRoutes.map((route) => route.path)).toEqual([
      "/",
      "/product/[id]",
    ]);
    expect(payload.appRoutes[0]?.definition).toBeNull();
    const product = payload.appRoutes[1]?.definition;
    expect(product?.exportName).toBe("product");
    expect(product?.file).toBe("lib/routes.ts");
    expect(product?.params.id?.kind).toBe("integer");
    expect(product?.params.id?.segmentKind).toBe("single");
    expect(product?.search.kind).toBe("codecs");
    expect(product?.search.keys?.q?.presence).toBe("optional");
    expect(payload.pagesRoutes[0]?.definition).not.toBeNull();
    expect(payload.duplicates).toEqual([]);
    expect(payload.loadFailures).toEqual([]);
    expect(payload.orphanDefinitions).toEqual([]);
  });

  it("maps scan errors (route collisions) to exit 2", async () => {
    makeProject(["app/about/page.tsx", "pages/about.tsx"]);
    const run = await list();
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain("collision");
  });

  it("--help prints list usage and exits 0", async () => {
    makeProject(["app/page.tsx"]);
    const run = await list(["--help"]);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("Usage: paramour list");
  });
});
