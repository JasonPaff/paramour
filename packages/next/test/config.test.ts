import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfigFile } from "../src/config.js";
import { makeTempDir } from "./helpers.js";

function makeProject(files: Record<string, string>): string {
  const root = makeTempDir();
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), content);
  }
  return root;
}

describe("loadConfigFile (TR7 / §7.2)", () => {
  it("returns undefined when no config file exists", async () => {
    await expect(loadConfigFile(makeTempDir())).resolves.toBeUndefined();
  });

  it("loads a TypeScript config through jiti", async () => {
    const root = makeProject({
      "paramour.config.ts": `const config: { pageExtensions: string[] } = { pageExtensions: ["mdx", "tsx"] };\nexport default config;\n`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ pageExtensions: ["mdx", "tsx"] });
    expect(loaded?.path).toBe(join(root, "paramour.config.ts"));
  });

  it("loads an .mjs config", async () => {
    const root = makeProject({
      "paramour.config.mjs": `export default { outFile: "types/routes.d.ts" };\n`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ outFile: "types/routes.d.ts" });
  });

  it("loads a .json config", async () => {
    const root = makeProject({
      "paramour.config.json": `{ "appDir": "src/app" }\n`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ appDir: "src/app" });
  });

  it("prefers .ts over .mjs over .json when several exist", async () => {
    const root = makeProject({
      "paramour.config.json": `{ "appDir": "from-json" }`,
      "paramour.config.mjs": `export default { appDir: "from-mjs" };`,
      "paramour.config.ts": `export default { appDir: "from-ts" };`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ appDir: "from-ts" });
  });

  it("accepts a module with only named exports (no default)", async () => {
    const root = makeProject({
      "paramour.config.mjs": `export const appDir = "app";\n`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ appDir: "app" });
  });

  it("rejects a non-object export, naming the file", async () => {
    const root = makeProject({
      "paramour.config.mjs": `export default 42;\n`,
    });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /paramour\.config\.mjs must export a config object/,
    );
  });

  it("rejects a JSON array config", async () => {
    const root = makeProject({ "paramour.config.json": `[]` });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /must export a config object/,
    );
  });

  it("rejects a JSON null config", async () => {
    const root = makeProject({ "paramour.config.json": `null` });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /must export a config object/,
    );
  });

  it("rejects an .mjs config default-exporting a function", async () => {
    const root = makeProject({
      "paramour.config.mjs": `export default () => ({ appDir: "app" });\n`,
    });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /must export a config object/,
    );
  });

  it("rejects pageExtensions entries with a leading dot (would silently match nothing)", async () => {
    const root = makeProject({
      "paramour.config.json": `{ "pageExtensions": ["tsx", ".mdx"] }`,
    });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /`pageExtensions` entries must not start with a dot: "\.mdx"/,
    );
  });

  it("names the file on invalid JSON syntax", async () => {
    const root = makeProject({ "paramour.config.json": `{ "appDir": ` });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /paramour\.config\.json: invalid JSON/,
    );
  });

  it("accepts pagesDir (PR8)", async () => {
    const root = makeProject({
      "paramour.config.json": `{ "pagesDir": "legacy-pages" }`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ pagesDir: "legacy-pages" });
  });

  it("accepts routeFiles globs", async () => {
    const root = makeProject({
      "paramour.config.json": `{ "routeFiles": ["src/routes/**/*.ts"] }`,
    });
    const loaded = await loadConfigFile(root);
    expect(loaded?.config).toEqual({ routeFiles: ["src/routes/**/*.ts"] });
  });

  it("rejects malformed routeFiles", async () => {
    const cases = [
      `{ "routeFiles": "src/routes/**" }`,
      `{ "routeFiles": [] }`,
      `{ "routeFiles": ["src/routes/**", 7] }`,
      `{ "routeFiles": [""] }`,
    ];
    for (const json of cases) {
      const root = makeProject({ "paramour.config.json": json });
      await expect(loadConfigFile(root)).rejects.toThrow(
        /`routeFiles` must be a non-empty array of non-empty glob strings/,
      );
    }
  });

  it("rejects unknown keys (typo protection)", async () => {
    const root = makeProject({
      "paramour.config.json": `{ "pagesExtensions": ["tsx"] }`,
    });
    await expect(loadConfigFile(root)).rejects.toThrow(
      /unknown key `pagesExtensions`/,
    );
  });

  it("rejects wrongly typed fields, naming the key", async () => {
    const cases: [string, RegExp][] = [
      [`{ "appDir": 42 }`, /`appDir` must be a non-empty string/],
      [`{ "appDir": "" }`, /`appDir` must be a non-empty string/],
      [`{ "outFile": "" }`, /`outFile` must be a non-empty string/],
      [`{ "pagesDir": 42 }`, /`pagesDir` must be a non-empty string/],
      [
        `{ "pageExtensions": "tsx" }`,
        /`pageExtensions` must be a non-empty array/,
      ],
      [
        `{ "pageExtensions": [] }`,
        /`pageExtensions` must be a non-empty array/,
      ],
      [
        `{ "pageExtensions": ["tsx", 7] }`,
        /`pageExtensions` must be a non-empty array/,
      ],
    ];
    for (const [json, error] of cases) {
      const root = makeProject({ "paramour.config.json": json });
      await expect(loadConfigFile(root)).rejects.toThrow(error);
    }
  });
});
