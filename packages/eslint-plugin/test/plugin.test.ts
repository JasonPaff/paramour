import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import plugin from "../src/index.js";

describe("plugin meta", () => {
  it("reports the package's own version (ESLint cache keys depend on it)", () => {
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(plugin.meta.version).toBe(version);
  });

  it("registers every rule in the recommended preset", () => {
    const recommended = plugin.configs.recommended.rules ?? {};
    expect(Object.keys(recommended).sort()).toEqual(
      Object.keys(plugin.rules)
        .map((name) => `paramour/${name}`)
        .sort(),
    );
  });
});
