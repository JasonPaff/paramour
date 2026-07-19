"use client";

import type { ReactNode } from "react";

import { buildSearchString, encodeSearch, type SearchConfig } from "paramour";
import { parseValue } from "paramour/internal";

import { messageOf, show } from "@/lib/show-value";

import { TextInput, WireListInput } from "./controls";
import {
  type ExplorerState,
  type KeyDescriptor,
  omitInput,
} from "./descriptor";
import { RuleLink } from "./rule-link";

type Inputs = ExplorerState["inputs"];

type Outcome =
  | { error: unknown; kind: "serialize-error" }
  | { kind: "invalid" }
  | { kind: "ok"; pairs: [string, string][]; url: string };

/**
 * The encode pane (plan-docs-milestone-5 B3): per-key wire-form inputs are
 * parsed through the real codec into typed values, then serialized with the
 * shipped `searchToString` pipeline. Elision (D8), empty-vs-absent (S3), and
 * `SerializeError`s all render exactly as the library produced them.
 */
export function EncodePane({
  config,
  inputs,
  keys,
  onChange,
}: {
  config: SearchConfig;
  inputs: Inputs;
  keys: readonly KeyDescriptor[];
  onChange: (inputs: Inputs) => void;
}) {
  const parseErrors = new Map<string, string>();
  const values: Record<string, unknown> = {};
  for (const key of keys) {
    const codec = config[key.name];
    const raw = inputs[key.name];
    if (codec === undefined || raw === undefined) continue;
    try {
      values[key.name] =
        key.kind === "array"
          ? (Array.isArray(raw) ? raw : [raw]).map((element) =>
              parseValue(codec, element),
            )
          : parseValue(codec, typeof raw === "string" ? raw : (raw[0] ?? ""));
    } catch (error) {
      parseErrors.set(key.name, messageOf(error));
    }
  }

  let outcome: Outcome;
  if (parseErrors.size > 0) {
    outcome = { kind: "invalid" };
  } else {
    try {
      const pairs = encodeSearch(config, values);
      outcome = { kind: "ok", pairs, url: buildSearchString(pairs) };
    } catch (error) {
      outcome = { error, kind: "serialize-error" };
    }
  }

  function setPresent(key: KeyDescriptor, present: boolean) {
    onChange(
      present
        ? { ...inputs, [key.name]: key.kind === "array" ? [] : "" }
        : omitInput(inputs, key.name),
    );
  }

  function setValue(key: KeyDescriptor, value: string | string[]) {
    onChange({ ...inputs, [key.name]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      {keys.map((key, index) => {
        const raw = inputs[key.name];
        const present = raw !== undefined;
        const parseError = parseErrors.get(key.name);
        return (
          <div
            className="flex flex-col gap-1 rounded-lg border border-fd-border bg-fd-card p-3"
            key={index}
          >
            <label className="flex items-center gap-2">
              <input
                aria-label={`include ${key.name}`}
                checked={present}
                className="size-4 accent-fd-primary"
                onChange={(event) => {
                  setPresent(key, event.target.checked);
                }}
                type="checkbox"
              />
              <span className="font-mono text-sm font-semibold">
                {key.name}
              </span>
              <span className="text-xs text-fd-muted-foreground">
                {key.kind}
                {typedNote(key, values)}
              </span>
            </label>
            {present ? (
              key.kind === "array" ? (
                <WireListInput
                  label={key.name}
                  onChange={(value) => {
                    setValue(key, value);
                  }}
                  values={Array.isArray(raw) ? raw : [raw]}
                />
              ) : (
                <TextInput
                  aria-label={`value for ${key.name} (wire form)`}
                  onChange={(event) => {
                    setValue(key, event.target.value);
                  }}
                  value={typeof raw === "string" ? raw : (raw[0] ?? "")}
                />
              )
            ) : null}
            {parseError === undefined ? (
              <WireNote outcome={outcome} present={present} value={key} />
            ) : (
              <p className="font-mono text-xs text-fd-error">
                ✗ does not parse as {key.kind}: {parseError}
              </p>
            )}
          </div>
        );
      })}

      <UrlBox outcome={outcome} />

      <p className="text-sm text-fd-muted-foreground">
        Try it: set a value equal to a key&apos;s default and watch it vanish (
        <RuleLink id="D8" />
        ), keep an included key empty to see <code>key=</code> stay distinct
        from absence (<RuleLink id="S3" />
        ), type a space to get <code>%20</code> — never <code>+</code> (
        <RuleLink id="S2" />
        ), or un-include a required key for a live <code>SerializeError</code>.
      </p>
    </div>
  );
}

/** The typed value the wire form parsed into, shown beside the key name. */
function typedNote(
  key: KeyDescriptor,
  values: Record<string, unknown>,
): string {
  if (!Object.hasOwn(values, key.name)) return "";
  return ` — parsed: ${show(values[key.name])}`;
}

function UrlBox({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "invalid") {
    return (
      <div className="rounded-lg border border-fd-border bg-fd-secondary/50 px-4 py-3 text-sm text-fd-muted-foreground">
        Fix the inputs marked ✗ above to build the URL.
      </div>
    );
  }
  if (outcome.kind === "serialize-error") {
    const error = outcome.error;
    return (
      <div className="rounded-lg border border-fd-error/50 bg-fd-card px-4 py-3 font-mono text-sm">
        <span className="font-semibold text-fd-error">
          {error instanceof Error ? error.name : "Error"}
        </span>
        <span className="text-fd-muted-foreground">: {messageOf(error)}</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-fd-primary/40 bg-fd-card px-4 py-3">
      <p className="text-xs font-medium text-fd-muted-foreground">
        searchToString(config, values)
      </p>
      <p className="font-mono text-sm break-all">
        {outcome.url === "" ? (
          <span className="text-fd-muted-foreground">
            &quot;&quot; — no pairs, no <code>?</code> (
            <RuleLink id="S1" />)
          </span>
        ) : (
          outcome.url
        )}
      </p>
    </div>
  );
}

/** A key's contribution to the wire, or why it has none. */
function WireNote({
  outcome,
  present,
  value,
}: {
  outcome: Outcome;
  present: boolean;
  value: KeyDescriptor;
}) {
  if (outcome.kind !== "ok") return null;
  const own = outcome.pairs.filter(([name]) => name === value.name);
  if (own.length > 0) {
    return (
      <p className="font-mono text-xs break-all text-fd-muted-foreground">
        → {buildSearchString(own).slice(1)}
      </p>
    );
  }
  let note: null | ReactNode = null;
  if (!present) {
    note =
      value.kind === "array" ? (
        <>
          absent → nothing on the wire (<RuleLink id="S6" />)
        </>
      ) : typeof value.presence === "object" ? (
        <>
          absent → omitted (<RuleLink id="S3" />
          ); decodes back to the default
        </>
      ) : (
        <>
          absent → omitted (<RuleLink id="S3" />)
        </>
      );
  } else if (value.kind === "array") {
    note = (
      <>
        [] ≡ absent → nothing on the wire (<RuleLink id="S6" />)
      </>
    );
  } else if (typeof value.presence === "object") {
    note = (
      <>
        equals the default → elided (<RuleLink id="D8" />)
      </>
    );
  }
  return note === null ? null : (
    <p className="font-mono text-xs text-fd-muted-foreground">→ {note}</p>
  );
}
