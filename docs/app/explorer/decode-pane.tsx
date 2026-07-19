"use client";

import type { ReactNode } from "react";

import {
  type AnyCodec,
  decodeSearch,
  type SearchConfig,
  SearchDecodeError,
} from "paramour";
import { parseValue } from "paramour/internal";

import { messageOf, show } from "@/lib/show-value";

import type { KeyDescriptor } from "./descriptor";

import { RuleLink } from "./rule-link";

type Result =
  | { decoded: Record<string, unknown>; kind: "ok" }
  | { issues: readonly { key: string; message: string }[]; kind: "issues" }
  | { kind: "other"; message: string };

/**
 * The decode pane (plan-docs-milestone-5 B3): a pasted query string runs
 * through the shipped `decodeSearch`, rendering decoded values or the
 * aggregated `issues[]` — with `.catch()` recovery made visible by probing
 * each key's raw parse outcome (the same `parseValue` probe the devtools
 * panel uses for catch attribution).
 */
export function DecodePane({
  config,
  keys,
  onChange,
  query,
}: {
  config: SearchConfig;
  keys: readonly KeyDescriptor[];
  onChange: (query: string) => void;
  query: string;
}) {
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  let result: Result;
  try {
    result = {
      decoded: decodeSearch(config, params),
      kind: "ok",
    };
  } catch (error) {
    result =
      error instanceof SearchDecodeError
        ? { issues: error.issues, kind: "issues" }
        : { kind: "other", message: messageOf(error) };
  }

  const declared = new Set(keys.map((key) => key.name));
  const unknown = [...new Set([...params.keys()])].filter(
    (name) => !declared.has(name),
  );

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fd-muted-foreground">
          query string (leading ? optional)
        </span>
        <textarea
          className="min-h-24 w-full rounded-md border border-fd-border bg-fd-background p-2 font-mono text-sm text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
          onChange={(event) => {
            onChange(event.target.value);
          }}
          spellCheck={false}
          value={query}
        />
      </label>

      {result.kind === "ok" ? (
        <>
          <div className="rounded-lg border border-fd-primary/40 bg-fd-card px-4 py-3">
            <p className="text-xs font-medium text-fd-muted-foreground">
              decodeSearch(config, new URLSearchParams(query))
            </p>
            <p className="font-mono text-sm break-all">
              {show(result.decoded)}
            </p>
          </div>
          <ul className="flex flex-col gap-1">
            {keys.map((key, index) => {
              const codec = config[key.name];
              if (codec === undefined) return null;
              return (
                <li
                  className="flex flex-wrap items-baseline gap-x-2 rounded-md border border-fd-border bg-fd-card px-3 py-1.5 font-mono text-xs"
                  key={index}
                >
                  <span className="font-semibold">{key.name}</span>
                  <span className="break-all text-fd-foreground">
                    {show(result.decoded[key.name])}
                  </span>
                  <DecodeNote codec={codec} params={params} value={key} />
                </li>
              );
            })}
          </ul>
        </>
      ) : result.kind === "issues" ? (
        <div className="rounded-lg border border-fd-error/50 bg-fd-card px-4 py-3">
          <p className="font-mono text-sm">
            <span className="font-semibold text-fd-error">
              SearchDecodeError
            </span>
            <span className="text-fd-muted-foreground">
              {" "}
              — issues[] aggregates every failed key:
            </span>
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
            {result.issues.map((issue, index) => (
              <li key={index}>
                <span className="font-semibold">{issue.key}</span>
                <span className="text-fd-muted-foreground">
                  : {issue.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border border-fd-error/50 bg-fd-card px-4 py-3 font-mono text-sm text-fd-error">
          {result.message}
        </div>
      )}

      {unknown.length > 0 ? (
        <p className="font-mono text-xs text-fd-muted-foreground">
          ignored: {unknown.join(", ")} — unknown keys are never validated (
          <RuleLink id="P8" />)
        </p>
      ) : null}

      <p className="text-sm text-fd-muted-foreground">
        Try it: give a key a value that doesn&apos;t parse and watch{" "}
        <code>issues[]</code> name it — then toggle <code>.catch()</code> on
        that key in the composer to see per-key recovery instead. Duplicate a
        scalar key for the never-disambiguated <RuleLink id="P5" /> error, or
        write <code>a,,b</code> into a csv for its strict grammar (
        <RuleLink id="CV3" />
        ).
      </p>
    </div>
  );
}

/** How this key's decoded value came to be, probed without catch recovery. */
function DecodeNote({
  codec,
  params,
  value,
}: {
  codec: AnyCodec;
  params: URLSearchParams;
  value: KeyDescriptor;
}) {
  const raws = params.getAll(value.name);
  if (raws.length === 0) {
    if (value.kind === "array") {
      return (
        <Note tone="muted">
          absent → [] (<RuleLink id="P6" />)
        </Note>
      );
    }
    if (typeof value.presence === "object") {
      return <Note tone="muted">absent → default applied</Note>;
    }
    if (value.presence === "optional") {
      return <Note tone="muted">absent → undefined</Note>;
    }
    return null;
  }
  if (value.kind === "array") {
    return raws.every((raw) => parses(codec, raw)) ? null : (
      <Note tone="recovered">recovered by .catch()</Note>
    );
  }
  if (raws.length > 1) {
    return (
      <Note tone="recovered">
        duplicate scalar keys (<RuleLink id="P5" />) → recovered by .catch()
      </Note>
    );
  }
  const raw = raws[0];
  if (raw === undefined || parses(codec, raw)) return null;
  return <Note tone="recovered">parse failed → recovered by .catch()</Note>;
}

function Note({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "muted" | "recovered";
}) {
  return (
    <span
      className={
        tone === "recovered" ? "text-fd-primary" : "text-fd-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

function parses(codec: AnyCodec, raw: string): boolean {
  try {
    parseValue(codec, raw);
    return true;
  } catch {
    return false;
  }
}
