/**
 * Publication drift check (design-14 DS11, plan-docs-milestone-5 A4): the
 * public wire-format spec page must publish exactly the rule IDs the
 * conformance suite cites, modulo the explicit allowlist below. The read
 * across package boundaries into `docs/` is deliberate — the spec page is
 * the public republication of the rules this package's conformance suite
 * pins, and cross-checking the two files IS this test's purpose. It lives
 * beside `conformance.test.ts`, whose citations are half its input.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Published rules deliberately not cited in conformance.test.ts, each with
 * the reason there is no wire-level conformance assertion to make.
 */
const ALLOWLIST: Record<string, string> = {
  CV2: "define-time composition guard (modified/nested csv elements are rejected at construction); pinned by codecs.test.ts and the type tests",
  D5: "type-state rule — params configs reject presence modifiers at compile time; the wire consequence (required-missing) is pinned by the R-family tests",
  SS1: "definition-time API rule (raw mode only via the explicit rawSearch wrapper); runtime behavior pinned by raw-search.test.ts",
  SS2: "runtime discrimination of the search slot (isRawSearch); pinned by raw-search.test.ts and the derived-surface tests",
  SS6: "type-level rule (raw-search input/output inference); pinned by the tstyche type tests",
  SS7: "absence-of-API rule (no per-key modifiers or round-trip in raw mode); the observable half is SS5's conformance test",
};

/**
 * The wire-rule families. The conformance file's own `C*` case numbering is
 * not a spec family and is deliberately not matched; `SS`/`PP` must precede
 * the single-letter alternatives so they win at the same position.
 */
const RULE_ID = /\b(?:SS|CV|PP|[SPDR])\d+\b/g;

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("wire-format spec publication", () => {
  const mdx = read("../../../docs/content/docs/reference/wire-format.mdx");
  const conformance = read("./conformance.test.ts");

  // Only <Rule id="…"> declarations count as published — prose
  // cross-references (e.g. "see S3") are not publication.
  const published = new Set(
    [...mdx.matchAll(/<Rule id="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((id): id is string => id !== undefined),
  );
  const cited = new Set(conformance.match(RULE_ID) ?? []);

  it("publishes at least one rule per wire family", () => {
    // A regression guard for the extraction itself: an MDX rewrite that
    // breaks the <Rule id> pattern would otherwise pass both asymmetry
    // checks by publishing nothing that is also uncited.
    for (const family of ["S", "P", "SS", "D", "CV", "PP", "R"]) {
      expect(
        [...published].some((id) => new RegExp(`^${family}\\d+$`).test(id)),
        `no published rules found for family ${family}`,
      ).toBe(true);
    }
  });

  it("every rule ID cited by the conformance suite is published", () => {
    const unpublished = [...cited].filter((id) => !published.has(id)).sort();
    expect(unpublished).toEqual([]);
  });

  it("every published rule ID is conformance-cited or allowlisted", () => {
    const unpinned = [...published]
      .filter((id) => !cited.has(id) && !(id in ALLOWLIST))
      .sort();
    expect(unpinned).toEqual([]);
  });

  it("the allowlist stays minimal: entries are published and still uncited", () => {
    const stale = Object.keys(ALLOWLIST)
      .filter((id) => cited.has(id) || !published.has(id))
      .sort();
    expect(stale).toEqual([]);
  });
});
