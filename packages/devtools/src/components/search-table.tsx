import type { AnyCodec, CodecDescription, SearchDescription } from "paramour";
import type { ReactNode } from "react";

import { buildSearchString } from "paramour";
import { useState } from "react";

import type { Draft } from "../edit.js";
import type { ParamourObservation, ParamourSearchWire } from "../seam.js";

import { buildCommittedPairs, draftLines } from "../edit.js";
import { formatShape, formatWire, jsLiteral } from "../format.js";
import { attributionFor, previewDecode } from "../inference.js";
import { CodecInput, isMultilineWidget } from "./codec-input.js";
import { AttributionTag, ValueCell } from "./primitives.js";

/**
 * The search half of the inspector (DT7) and the panel's editing surface
 * (DT8): per-key widgets validating live through the codec, a per-key
 * RAW WIRE toggle for reproducing invalid values, clear-to-absent, and a
 * commit-to-push flow — Enter/blur assembles the FULL pair list (untouched
 * and unknown keys carried verbatim), serializes through
 * `buildSearchString` (spaces as %20 — S-rule fidelity), and navigates via
 * the EMITTING hook's `navigate` capability. The parent remounts this
 * component when the observed wire changes (its React key), which is the
 * drafts-invalidation rule: an external navigation resets the edit session.
 */
export function SearchTable({
  changeStamps,
  description,
  navigate,
  observation,
  searchConfig,
}: {
  readonly changeStamps: Readonly<Record<string, number>>;
  readonly description: SearchDescription;
  readonly navigate: ((search: string) => void) | undefined;
  readonly observation: ParamourObservation | undefined;
  readonly searchConfig: Readonly<Record<string, AnyCodec>> | undefined;
}): ReactNode {
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});
  const [invalidKeys, setInvalidKeys] = useState<readonly string[]>([]);

  if (description.kind === "none") {
    return (
      <>
        <div className="pmr-section-title">Search</div>
        <div className="pmr-muted">no search params declared</div>
      </>
    );
  }

  const wire: ParamourSearchWire =
    observation?.kind === "search" ? observation.wire : [];
  const parsed =
    observation?.result.status === "success"
      ? (observation.result.data as Readonly<Record<string, unknown>>)
      : undefined;

  if (description.kind === "raw") {
    // DT7: a rawSearch route renders its parsed value with the schema shown
    // as opaque; per-key editing has no per-key codecs to validate through.
    return (
      <>
        <div className="pmr-section-title">Search</div>
        <table className="pmr-table">
          <thead>
            <tr>
              <th>wire</th>
              <th>parsed</th>
              <th>shape</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <ValueCell stamp={0}>
                  {wire.length === 0
                    ? "—"
                    : wire.map(([key, value]) => `${key}=${value}`).join(" & ")}
                </ValueCell>
              </td>
              <td>
                <ValueCell stamp={0}>
                  {parsed === undefined ? "—" : jsLiteral(parsed)}
                </ValueCell>
              </td>
              <td className="pmr-mono pmr-muted">raw (opaque schema)</td>
            </tr>
          </tbody>
        </table>
      </>
    );
  }

  const config = searchConfig ?? {};
  const wireValuesFor = (key: string): readonly string[] =>
    wire.filter((pair) => pair[0] === key).map((pair) => pair[1]);

  // `overrides` carries a same-event draft (the checkbox's toggle-and-
  // commit) that the `drafts` state cannot deliver yet — `setDrafts` lands
  // next render, after this commit already read it.
  const commit = (overrides?: Readonly<Record<string, Draft>>): void => {
    const effective = { ...drafts, ...overrides };
    if (navigate === undefined || Object.keys(effective).length === 0) return;
    let search: string;
    try {
      // Untouched pairs carry from the LIVE URL, not the observation's
      // decode-time snapshot: undeclared-key churn (utm_* stripped or added
      // by the app) never re-emits (SEL4 fingerprints declared keys only),
      // so the snapshot can be stale in both directions — committing it
      // would resurrect removed pairs and drop added ones. `navigate` is
      // only handed to CURRENT sessions (DT10), so the live URL is this
      // session's page.
      const result = buildCommittedPairs(config, liveWirePairs(), effective);
      if (result.status === "invalid") {
        setInvalidKeys(result.invalidKeys);
        return;
      }
      search = buildSearchString(result.pairs);
    } catch {
      // A serializer/byte-layer throw (SerializeError — custom codec, lone
      // surrogate) surfaces after the preview validated the parse; it must
      // not escape the event handler. Drafts stay editable.
      setInvalidKeys(Object.keys(effective));
      return;
    }
    setInvalidKeys([]);
    // Search string ONLY (DT8): the hook-side navigate resolves it against
    // its own basePath-/locale-relative pathname — `window.location.pathname`
    // here would double a configured basePath through router.replace.
    navigate(search);
    setDrafts({});
  };

  const setDraft = (key: string, draft: Draft): void => {
    setDrafts((previous) => ({ ...previous, [key]: draft }));
    setInvalidKeys((previous) => previous.filter((entry) => entry !== key));
  };

  return (
    <>
      <div className="pmr-section-title">Search</div>
      <table className="pmr-table">
        <thead>
          <tr>
            <th>key</th>
            <th>wire</th>
            <th>parsed</th>
            <th>shape</th>
            <th aria-label="attribution" />
            <th>edit</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(description.keys).map(([key, keyDescription]) => {
            const codec = config[key];
            const wireValues = wireValuesFor(key);
            const draft = drafts[key];
            const attribution =
              codec === undefined
                ? undefined
                : attributionFor(keyDescription, codec, wireValues);
            return (
              <SearchRow
                attribution={attribution}
                changeStamp={changeStamps[key] ?? 0}
                codec={codec}
                dataKey={key}
                description={keyDescription}
                draft={draft}
                invalid={invalidKeys.includes(key)}
                key={key}
                onCommit={(override) => {
                  commit(
                    override === undefined ? undefined : { [key]: override },
                  );
                }}
                onDraftChange={(next) => {
                  setDraft(key, next);
                }}
                parsedValue={parsed?.[key]}
                showParsed={parsed !== undefined}
                wireValues={wireValues}
              />
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/**
 * The search pairs as they are on the wire RIGHT NOW. `URLSearchParams`
 * decoding matches what the emitting hooks' sources see (`useSearchParams`
 * IS a URLSearchParams view), so carried pairs round-trip through
 * `buildSearchString` with the same fidelity as the observed snapshot's.
 */
function liveWirePairs(): ParamourSearchWire {
  const pairs: [string, string][] = [];
  for (const [key, value] of new URLSearchParams(window.location.search)) {
    pairs.push([key, value]);
  }
  return pairs;
}

function previewLine(
  codec: AnyCodec,
  description: CodecDescription,
  key: string,
  draft: Draft,
  invalid: boolean,
): ReactNode {
  // Same arity rule and line-splitting as the commit path (draftLines), so
  // what the preview shows is what a commit would do.
  const input =
    draft.value.kind === "absent"
      ? undefined
      : description.arity === "many"
        ? draftLines(draft.value.text)
        : draft.value.text;
  const preview = previewDecode(codec, key, input);
  if (preview.status === "error") {
    return (
      <div className="pmr-preview pmr-preview--error">
        {invalid ? "✕ " : ""}
        {preview.issues[0]?.message ?? "invalid"}
      </div>
    );
  }
  return (
    <div className="pmr-preview pmr-preview--ok">
      → {jsLiteral(preview.value)}
    </div>
  );
}

function SearchRow({
  attribution,
  changeStamp,
  codec,
  dataKey,
  description,
  draft,
  invalid,
  onCommit,
  onDraftChange,
  parsedValue,
  showParsed,
  wireValues,
}: {
  readonly attribution: "catch" | "default" | undefined;
  readonly changeStamp: number;
  readonly codec: AnyCodec | undefined;
  readonly dataKey: string;
  readonly description: CodecDescription;
  readonly draft: Draft | undefined;
  readonly invalid: boolean;
  readonly onCommit: (override?: Draft) => void;
  readonly onDraftChange: (draft: Draft) => void;
  readonly parsedValue: unknown;
  readonly showParsed: boolean;
  readonly wireValues: readonly string[];
}): ReactNode {
  const [raw, setRaw] = useState(false);
  // Only the multi-line textarea can represent repeated wire values; a
  // single-line widget seeded with a newline join would value-sanitize the
  // `\n` away ('1\n2' → '12'), and the first keystroke turns that
  // fabricated value into a committed draft replacing every original pair.
  // Broken wire (repeated key on an arity-one codec) seeds from the FIRST
  // pair; the wire column still shows all of them.
  const seedText = isMultilineWidget(description, raw)
    ? wireValues.join("\n")
    : (wireValues[0] ?? "");
  const draftText =
    draft === undefined || draft.value.kind === "absent"
      ? seedText
      : draft.value.text;
  const absent = draft?.value.kind === "absent";

  return (
    <tr>
      <td className="pmr-mono">{dataKey}</td>
      <td>
        <ValueCell stamp={0}>
          {formatWire(wireValues.length === 0 ? undefined : wireValues)}
        </ValueCell>
      </td>
      <td>
        <ValueCell stamp={changeStamp}>
          {showParsed ? jsLiteral(parsedValue) : "—"}
        </ValueCell>
      </td>
      <td className="pmr-mono pmr-muted">{formatShape(description)}</td>
      <td>
        {attribution === undefined ? null : (
          <AttributionTag kind={attribution} />
        )}
      </td>
      <td>
        {codec === undefined ? null : (
          <>
            <CodecInput
              codec={codec}
              dataKey={dataKey}
              description={description}
              draftText={absent ? "" : draftText}
              hasDraft={draft?.value.kind === "text"}
              onCommit={(immediateText) => {
                onCommit(
                  immediateText === undefined
                    ? undefined
                    : {
                        mode: raw ? "raw" : "codec",
                        value: { kind: "text", text: immediateText },
                      },
                );
              }}
              onDraftChange={(text) => {
                onDraftChange({
                  mode: raw ? "raw" : "codec",
                  value: { kind: "text", text },
                });
              }}
              parsedValue={parsedValue}
              raw={raw}
            />
            <button
              aria-label={`toggle raw wire editing for ${dataKey}`}
              className="pmr-icon-button"
              data-active={raw}
              onClick={() => {
                setRaw((previous) => {
                  const next = !previous;
                  if (draft?.value.kind === "text") {
                    onDraftChange({
                      mode: next ? "raw" : "codec",
                      value: draft.value,
                    });
                  }
                  return next;
                });
              }}
              // Mousedown on the button would BLUR a focused input first,
              // and blur commits — navigating with the pending draft before
              // this button's click ever runs. preventDefault keeps focus.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              type="button"
            >
              raw
            </button>
            <button
              aria-label={`clear ${dataKey} to absent`}
              className="pmr-icon-button"
              onClick={() => {
                onDraftChange({
                  mode: raw ? "raw" : "codec",
                  value: { kind: "absent" },
                });
              }}
              // Same blur-commit race as the raw toggle above.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              type="button"
            >
              ⌀
            </button>
            {draft === undefined
              ? null
              : previewLine(codec, description, dataKey, draft, invalid)}
          </>
        )}
      </td>
    </tr>
  );
}
