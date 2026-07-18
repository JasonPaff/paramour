import type { AnyCodec, CodecDescription, Issue, SearchConfig } from "paramour";

import {
  decodeSearch,
  foreignMessage,
  parseValue,
  SearchDecodeError,
} from "paramour";

/**
 * Pure decode/attribution logic (design-12 DT7/DT8). Everything here goes
 * through core's PUBLIC surface: `parseValue` (the catch-attribution probe
 * core exports for exactly this) and the single-key `decodeSearch` trick —
 * a synthesized one-key config gives full presence/default/catch/duplicate
 * semantics for one value without touching `~`-internals.
 */

/** Why a rendered value differs from the wire (DT7's inference rule). */
export type Attribution = "catch" | "default" | undefined;

export type PreviewResult =
  | { readonly issues: readonly Issue[]; readonly status: "error" }
  | { readonly status: "ok"; readonly value: unknown };

/**
 * DT7: default = wire absent + presence declared "defaulted"; catch = wire
 * present + `.catch()` declared + the parse would have failed without it.
 * The duplicate-scalar case (two values for a single-value param) is a
 * parse failure decodeSearch raises itself, so it can't be probed through
 * `parseValue` — special-cased here.
 */
export function attributionFor(
  description: CodecDescription,
  codec: AnyCodec,
  wireValues: readonly string[],
): Attribution {
  if (wireValues.length === 0) {
    return description.presence === "defaulted" ? "default" : undefined;
  }
  if (!description.caught) return undefined;
  if (description.arity === "single" && wireValues.length > 1) return "catch";
  return wireValues.some((raw) => parseWouldFail(codec, raw))
    ? "catch"
    : undefined;
}

/**
 * The raw parse outcome WITHOUT `.catch()` recovery — core's `parseValue`
 * exists for this probe (DT7). Foreign throws from a custom codec count as
 * failures too: whatever the class, the wire value did not parse cleanly.
 */
export function parseWouldFail(codec: AnyCodec, raw: string): boolean {
  try {
    parseValue(codec, raw);
    return false;
  } catch {
    return true;
  }
}

/**
 * What WOULD this wire draft decode to (DT8's live edit validation)?
 * `draft === undefined` previews absence — surfacing the default value or
 * `undefined`, teaching presence semantics. Full fidelity via the
 * single-key `decodeSearch`: defaults, catches, required-missing, and the
 * duplicate-scalar rejection all behave exactly as the real decode would.
 */
export function previewDecode(
  codec: AnyCodec,
  key: string,
  draft: readonly string[] | string | undefined,
): PreviewResult {
  const config: SearchConfig = { [key]: codec };
  const source: Record<string, string | string[] | undefined> = {};
  if (draft !== undefined) {
    source[key] = typeof draft === "string" ? draft : [...draft];
  }
  try {
    const decoded = decodeSearch(config, source) as Record<string, unknown>;
    return { status: "ok", value: decoded[key] };
  } catch (error) {
    if (error instanceof SearchDecodeError) {
      return { issues: error.issues, status: "error" };
    }
    // Foreign throws arrive UNWRAPPED (decodeSearch's taxonomy) from user
    // schema/custom-codec code, including values String() itself cannot
    // stringify — core's foreignMessage carries the hardening.
    return {
      issues: [{ key, message: foreignMessage(error) }],
      status: "error",
    };
  }
}
