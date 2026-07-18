import type { AnyCodec, CodecDescription } from "paramour";
import type { ReactNode } from "react";

import { serializeValue } from "paramour";

export function CodecInput({
  codec,
  dataKey,
  description,
  draftText,
  hasDraft,
  onCommit,
  onDraftChange,
  parsedValue,
  raw,
}: {
  readonly codec: AnyCodec;
  readonly dataKey: string;
  readonly description: CodecDescription;
  readonly draftText: string;
  /** True when a text draft exists — the draft then owns the widget state. */
  readonly hasDraft: boolean;
  /**
   * Commit now; `immediateText` carries a same-event draft (the checkbox's
   * toggle-and-commit) that React state cannot deliver to this commit —
   * `setDrafts` lands next render, AFTER the commit would read it.
   */
  readonly onCommit: (immediateText?: string) => void;
  readonly onDraftChange: (text: string) => void;
  /** The decode's parsed value — the EFFECTIVE state when no draft exists. */
  readonly parsedValue: unknown;
  readonly raw: boolean;
}): ReactNode {
  const commitOnEnter = (key: string): void => {
    if (key === "Enter") onCommit();
  };

  if (isMultilineWidget(description, raw)) {
    // Repeated-key array codecs: one wire value per line (csv keeps its
    // single comma-joined wire value and stays a plain input below).
    return (
      <textarea
        aria-label={`edit ${dataKey}`}
        className="pmr-textarea"
        onBlur={() => {
          onCommit();
        }}
        onChange={(event) => {
          onDraftChange(event.target.value);
        }}
        placeholder="one value per line"
        value={draftText}
      />
    );
  }

  if (!raw && description.kind === "boolean") {
    // Without a draft the box mirrors the EFFECTIVE parsed value — an
    // absent wire with `.default(true)` must render checked, or unchecking
    // it (committing `false`) is unreachable.
    const checked = hasDraft
      ? draftText === trueWire(codec, dataKey)
      : parsedValue === true;
    return (
      <input
        aria-label={`edit ${dataKey}`}
        checked={checked}
        className="pmr-input"
        onChange={(event) => {
          const text = event.target.checked
            ? trueWire(codec, dataKey)
            : falseWire(codec, dataKey);
          onDraftChange(text);
          onCommit(text);
        }}
        type="checkbox"
      />
    );
  }

  if (!raw && description.enumMembers !== undefined) {
    const members = description.enumMembers;
    // No draft: show the effective member (a defaulted enum reads as its
    // default), or the hidden placeholder when nothing parsed. A controlled
    // value that matches NO option would make the browser display the first
    // member while the draft stays "" — rendering that member unpickable
    // (selecting it fires no change event).
    const effectiveMember =
      typeof parsedValue === "string" && members.includes(parsedValue)
        ? parsedValue
        : "";
    return (
      <select
        aria-label={`edit ${dataKey}`}
        className="pmr-select"
        onBlur={() => {
          onCommit();
        }}
        onChange={(event) => {
          onDraftChange(event.target.value);
        }}
        onKeyDown={(event) => {
          commitOnEnter(event.key);
        }}
        value={draftText === "" ? effectiveMember : draftText}
      >
        <option disabled hidden value="" />
        {members.map((member) => (
          <option key={member} value={member}>
            {member}
          </option>
        ))}
      </select>
    );
  }

  const type = raw
    ? "text"
    : description.kind === "integer" || description.kind === "number"
      ? "number"
      : description.kind === "isoDate"
        ? "date"
        : "text";
  const placeholder = raw
    ? "raw wire value"
    : description.kind === "timestamp"
      ? "2026-01-01T00:00:00.000Z"
      : description.element !== undefined
        ? `${description.element.kind},…`
        : "";

  return (
    <input
      aria-label={raw ? `raw wire for ${dataKey}` : `edit ${dataKey}`}
      className="pmr-input"
      onBlur={() => {
        onCommit();
      }}
      onChange={(event) => {
        onDraftChange(event.target.value);
      }}
      onKeyDown={(event) => {
        commitOnEnter(event.key);
      }}
      placeholder={placeholder}
      step={description.kind === "integer" ? "1" : "any"}
      type={type}
      value={draftText}
    />
  );
}

/**
 * DT8's kind → widget dispatch. The draft currency is always the WIRE
 * string (`draftText`): structured widgets (toggle, select, date) convert
 * their widget value to wire before reporting, so the live preview always
 * reflects the true wire round-trip. Raw mode swaps in a mono text input
 * holding the wire verbatim. Enter and blur commit (the deliberate commit
 * point — no live-as-you-type navigation).
 */
/**
 * Which keys get the multi-line textarea (one wire value per line):
 * repeated-key array codecs in codec mode. Csv keeps its single
 * comma-joined wire value (element present) and raw mode always edits one
 * wire value in a mono input. Exported so the row's draft SEEDING can
 * agree: only this widget may be seeded with a newline join — single-line
 * inputs value-sanitize the `\n` away, fabricating a merged value.
 */
export function isMultilineWidget(
  description: CodecDescription,
  raw: boolean,
): boolean {
  return (
    !raw && description.arity === "many" && description.element === undefined
  );
}

/**
 * The boolean wires via the codec's own serializer — exact even for a
 * custom codec whose wire isn't literally "true"/"false".
 */
function falseWire(codec: AnyCodec, key: string): string {
  return safeWire(codec, key, false, "false");
}

function safeWire(
  codec: AnyCodec,
  key: string,
  value: boolean,
  fallback: string,
): string {
  try {
    return serializeValue(codec, key, value);
  } catch {
    return fallback;
  }
}

function trueWire(codec: AnyCodec, key: string): string {
  return safeWire(codec, key, true, "true");
}
