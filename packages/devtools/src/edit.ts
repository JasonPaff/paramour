import type { AnyCodec, SearchConfig } from "paramour";

import { describeCodec, encodeSearch } from "paramour";

import type { ParamourSearchWire } from "./seam.js";

import { previewDecode } from "./inference.js";

/**
 * Pure commit-flow assembly (design-12 DT8): merge the user's per-key
 * drafts into the observed wire pairs, preserving everything untouched.
 */

export type CommitResult =
  | { readonly invalidKeys: readonly string[]; readonly status: "invalid" }
  | { readonly pairs: ParamourSearchWire; readonly status: "ok" };

/** One key's edit state. `text` is the WIRE string — the single draft currency. */
export interface Draft {
  readonly mode: "codec" | "raw";
  readonly value: DraftValue;
}

export type DraftValue =
  | { readonly kind: "absent" }
  | { readonly kind: "text"; readonly text: string };

/**
 * DT8's commit semantics:
 * - Untouched keys (declared, unknown, even invalid/caught wire) carry
 *   VERBATIM in original wire order — never re-serialized.
 * - A codec-mode draft validates through the single-key decode; any failure
 *   blocks the whole commit. On success its pairs come from the single-key
 *   `encodeSearch`, so D8 default-elision and optional absence fall out
 *   (`[]` → key omitted).
 * - A raw-mode draft contributes its text verbatim (one pair per line for a
 *   multi-line draft) and is NEVER blocked — reproducing invalid wire is
 *   the point. Byte-layer percent-encoding still happens downstream in
 *   `buildSearchString`; raw mode bypasses codec serialization only.
 * - An `absent` draft omits the key.
 * - A drafted key not on the wire appends after the carried pairs, in
 *   drafts order.
 */
export function buildCommittedPairs(
  config: Readonly<Record<string, AnyCodec>>,
  wire: ParamourSearchWire,
  drafts: Readonly<Record<string, Draft>>,
): CommitResult {
  const invalidKeys: string[] = [];
  const replacements = new Map<string, ParamourSearchWire>();
  for (const [key, draft] of Object.entries(drafts)) {
    replacements.set(key, pairsForDraft(config, key, draft, invalidKeys));
  }
  if (invalidKeys.length > 0) return { invalidKeys, status: "invalid" };

  const pairs: [string, string][] = [];
  const replaced = new Set<string>();
  for (const [key, value] of wire) {
    const replacement = replacements.get(key);
    if (replacement === undefined) {
      pairs.push([key, value]);
      continue;
    }
    if (replaced.has(key)) continue;
    replaced.add(key);
    for (const pair of replacement) pairs.push([pair[0], pair[1]]);
  }
  for (const [key, replacement] of replacements) {
    if (replaced.has(key)) continue;
    for (const pair of replacement) pairs.push([pair[0], pair[1]]);
  }
  return { pairs, status: "ok" };
}

/**
 * Draft text → wire values, shared by the commit path and the live preview
 * so they can never disagree: one value per non-empty line, and a FULLY
 * CLEARED textarea is zero values (`[]` → key omitted through
 * `encodeSearch`), not one empty-string element. Raw mode shares the
 * line-splitting but maps the empty draft to one `key=` pair at its call
 * site — a raw empty draft is a legal wire value.
 */
export function draftLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n").filter((line) => line !== "");
}

function pairsForDraft(
  config: Readonly<Record<string, AnyCodec>>,
  key: string,
  draft: Draft,
  invalidKeys: string[],
): ParamourSearchWire {
  if (draft.value.kind === "absent") return [];
  const { text } = draft.value;
  const codec = config[key];
  if (draft.mode === "raw" || codec === undefined) {
    // Multi-line raw drafts (arity-"many" textareas) contribute one pair
    // per line; the empty draft — a legal wire value in raw mode —
    // contributes exactly one `key=` pair rather than draftLines's absence.
    const lines = text === "" ? [""] : draftLines(text);
    return lines.map((line) => [key, line] as const);
  }
  const preview = previewDecode(
    codec,
    key,
    describeCodec(codec).arity === "many" ? draftLines(text) : text,
  );
  if (preview.status === "error") {
    invalidKeys.push(key);
    return [];
  }
  const singleKeyConfig: SearchConfig = { [key]: codec };
  return encodeSearch(singleKeyConfig, { [key]: preview.value });
}
