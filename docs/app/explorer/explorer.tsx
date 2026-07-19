"use client";

import { useSearch } from "@paramour-js/next/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { href, type SearchConfig } from "paramour";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { messageOf } from "@/lib/show-value";

import type { ExplorerState } from "./descriptor";

import { buildSearchConfig, describeConfigSource } from "./build-config";
import { Composer } from "./composer";
import { DecodePane } from "./decode-pane";
import { EncodePane } from "./encode-pane";
import { explorerRoute } from "./route.def";

type Pane = "decode" | "encode";

/**
 * The explorer's client root (plan-docs-milestone-5 B3): ALL state lives in
 * the URL through the route's own search params — read with `useSearch`
 * (the safe hook: a hand-edited shared link renders its decode error, never
 * a crash), written with debounced `router.replace(href(...))`. The devtools
 * seam observes every decode for free.
 */
export function Explorer() {
  const search = useSearch(explorerRoute);

  if (search.status === "error") {
    return (
      <section className="rounded-lg border border-fd-error/50 bg-fd-card p-4">
        <p className="font-mono text-sm">
          <span className="font-semibold text-fd-error">
            {search.error.name}
          </span>
          <span className="text-fd-muted-foreground">
            {" "}
            — this shared link&apos;s state param doesn&apos;t decode. That is
            the wire format working:
          </span>
        </p>
        <ul className="mt-2 flex flex-col gap-0.5 font-mono text-xs">
          {search.error.issues.map((issue, index) => (
            <li key={index}>
              <span className="font-semibold">{issue.key}</span>
              <span className="text-fd-muted-foreground">
                : {issue.message}
              </span>
            </li>
          ))}
        </ul>
        <Link
          className="mt-3 inline-block text-sm font-medium text-fd-primary hover:underline"
          href={href(explorerRoute)}
        >
          Reset the explorer
        </Link>
      </section>
    );
  }

  return <Workbench pane={search.data.pane} urlState={search.data.config} />;
}

function PaneSection({
  config,
  draft,
  onDraftChange,
  onPaneChange,
  pane,
}: {
  config: SearchConfig;
  draft: ExplorerState;
  onDraftChange: (state: ExplorerState) => void;
  onPaneChange: (pane: Pane) => void;
  pane: Pane;
}) {
  return (
    <section aria-label="Encode and decode panes">
      <div
        className="inline-flex rounded-lg border border-fd-border bg-fd-secondary/50 p-0.5"
        role="group"
      >
        {(["encode", "decode"] as const).map((candidate) => (
          <Button
            aria-pressed={pane === candidate}
            className={
              pane === candidate
                ? "border-transparent bg-fd-background shadow-sm"
                : "border-transparent bg-transparent"
            }
            key={candidate}
            onClick={() => {
              onPaneChange(candidate);
            }}
          >
            {candidate === "encode" ? "Encode" : "Decode"}
          </Button>
        ))}
      </div>
      <div className="mt-3">
        {pane === "encode" ? (
          <EncodePane
            config={config}
            inputs={draft.inputs}
            keys={draft.keys}
            onChange={(inputs) => {
              onDraftChange({ ...draft, inputs });
            }}
          />
        ) : (
          <DecodePane
            config={config}
            keys={draft.keys}
            onChange={(query) => {
              onDraftChange({ ...draft, query });
            }}
            query={draft.query}
          />
        )}
      </div>
    </section>
  );
}

function Workbench({
  pane,
  urlState,
}: {
  pane: Pane;
  urlState: ExplorerState;
}) {
  const router = useRouter();
  const urlJson = JSON.stringify(urlState);

  // Local draft for responsive typing; the URL is still the store. The ref
  // guard + adopt effect mirror kitchen-sink's filter panel: back/forward
  // (or a devtools-panel navigation) re-adopts URL state we didn't write.
  const [draft, setDraft] = useState(urlState);
  const lastSent = useRef(urlJson);

  useEffect(() => {
    if (urlJson !== lastSent.current) {
      lastSent.current = urlJson;
      setDraft(urlState);
    }
  }, [urlJson, urlState]);

  // Debounced write-back: one replace per pause, not per keystroke — and
  // replace, not push, so typing doesn't spam history.
  useEffect(() => {
    const draftJson = JSON.stringify(draft);
    if (draftJson === urlJson) return;
    const timer = setTimeout(() => {
      lastSent.current = draftJson;
      router.replace(href(explorerRoute, { search: { config: draft, pane } }), {
        scroll: false,
      });
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, pane, router, urlJson]);

  const built = useMemo(() => {
    try {
      return {
        config: buildSearchConfig(draft.keys),
        error: undefined,
        source: describeConfigSource(draft.keys),
      };
    } catch (error) {
      return { config: undefined, error, source: undefined };
    }
  }, [draft.keys]);

  function switchPane(next: Pane) {
    if (next === pane) return;
    const draftJson = JSON.stringify(draft);
    lastSent.current = draftJson;
    router.replace(
      href(explorerRoute, { search: { config: draft, pane: next } }),
      { scroll: false },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Composer onChange={setDraft} state={draft} />

      {built.source === undefined ? null : (
        <pre className="overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-3 text-xs text-fd-card-foreground">
          <code>{built.source}</code>
        </pre>
      )}

      {built.config === undefined ? (
        <div className="rounded-lg border border-fd-error/50 bg-fd-card px-4 py-3 font-mono text-sm">
          <span className="font-semibold text-fd-error">
            {built.error instanceof Error ? built.error.name : "Error"}
          </span>
          <span className="text-fd-muted-foreground">
            : {messageOf(built.error)}
          </span>
        </div>
      ) : (
        <PaneSection
          config={built.config}
          draft={draft}
          onDraftChange={setDraft}
          onPaneChange={switchPane}
          pane={pane}
        />
      )}
    </div>
  );
}
