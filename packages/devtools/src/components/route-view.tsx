import type { AnyCodec, AnyRoute, Issue } from "paramour";
import type { ReactNode } from "react";

import { describeRoute, href, isRawSearch } from "paramour";
import { useMemo } from "react";

import type { ParamourObservation } from "../seam.js";
import type { RouteSession } from "../store.js";

import { jsLiteral, reproSnippet } from "../format.js";
import { parsedRecord } from "../store.js";
import { CopyToolbar } from "./copy-toolbar.js";
import { IssuesSection } from "./issues-section.js";
import { ParamsTable } from "./params-table.js";
import { RouterBadge, StatusDot } from "./primitives.js";
import { SearchTable } from "./search-table.js";

/**
 * One session's stacked single-scroll pane (DT15): route-match banner (path
 * pattern, router kind, status, copy toolbar), params table, search table,
 * then issues — rendered only when present, never behind a tab. A stale
 * (non-current, DT10) session renders its last-known snapshot with editing
 * disabled: its `navigate` belongs to a page that is no longer mounted.
 *
 * Sessions are immutable store records, so every derivation here is
 * memoized on the session reference — a panel re-render for some OTHER
 * session's observation must not re-run `describeRoute`, the literal
 * printers, or the `href` serialization.
 */
export function RouteView({
  session,
  stale,
}: {
  readonly session: RouteSession;
  readonly stale: boolean;
}): ReactNode {
  const derived = useMemo(() => {
    const description = describeRoute(session.route);
    const routerKind =
      session.params?.routerKind ?? session.search?.routerKind ?? "app";
    const params = parsedRecord(session.params);
    const search = parsedRecord(session.search);
    const parsedJson =
      params === undefined && search === undefined
        ? undefined
        : jsLiteral({
            ...(params === undefined ? {} : { params }),
            ...(search === undefined ? {} : { search }),
          });
    const issues: Issue[] = [
      ...issuesOf(session.params),
      ...issuesOf(session.search),
    ];

    // The blessed-internal search config, needed for editing; `describeRoute`
    // told us whether it's a codec map (RL6 — sanctioned consumer, same read
    // the hooks make).
    const searchSlot = (
      session.route as unknown as {
        "~search": Readonly<Record<string, AnyCodec>>;
      }
    )["~search"];
    const searchConfig =
      description.search.kind === "codecs" && !isRawSearch(searchSlot)
        ? searchSlot
        : undefined;
    return {
      description,
      issues,
      params,
      parsedJson,
      routerKind,
      search,
      searchConfig,
      snippet: reproSnippet(description.path, routerKind, params, search),
      staleHref: staleUrl(session.route, params, search),
      wireKey: wireFingerprint(session.search),
    };
  }, [session]);

  return (
    <section>
      <div className="pmr-banner">
        <span className="pmr-banner-path">{derived.description.path}</span>
        <RouterBadge router={derived.routerKind} />
        <StatusDot status={stale ? "stale" : session.status} />
        {stale ? <span className="pmr-stale-badge">stale snapshot</span> : null}
        <CopyToolbar
          parsedJson={derived.parsedJson}
          snippet={derived.snippet}
          url={stale ? derived.staleHref : window.location.href}
        />
      </div>
      <ParamsTable
        changeStamps={session.changeStamps.params}
        descriptions={derived.description.params}
        observation={session.params}
      />
      <SearchTable
        changeStamps={session.changeStamps.search}
        description={derived.description.search}
        // Remounting on a wire change is the drafts-invalidation rule: an
        // external navigation resets the edit session (DT8).
        key={derived.wireKey}
        // The NEWEST observation's navigate (either half) — the store keeps
        // it session-level so a stale half's closure can never shadow a
        // fresher one.
        navigate={stale ? undefined : session.navigate}
        observation={session.search}
        searchConfig={derived.searchConfig}
      />
      <IssuesSection issues={derived.issues} />
    </section>
  );
}

function issuesOf(
  observation: ParamourObservation | undefined,
): readonly Issue[] {
  if (observation?.result.status !== "error") return [];
  return observation.result.error.issues;
}

/**
 * A stale session's copy-url source (DT9): its snapshot belongs to a page
 * that is NO LONGER the live location, so the URL is rebuilt from the
 * parsed halves through core's `href` — the same serialization the user's
 * own code would run. Unbuildable (errored params, exotic schema throw) →
 * `undefined`, and the toolbar hides the button rather than copying the
 * wrong page's URL.
 */
function staleUrl(
  route: AnyRoute,
  params: Readonly<Record<string, unknown>> | undefined,
  search: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  const buildHref = href as (
    route: AnyRoute,
    options?: { params?: unknown; search?: unknown },
  ) => string;
  try {
    return buildHref(route, {
      ...(params === undefined ? {} : { params }),
      ...(search === undefined ? {} : { search }),
    });
  } catch {
    return undefined;
  }
}

function wireFingerprint(observation: ParamourObservation | undefined): string {
  if (observation?.kind !== "search") return "none";
  return JSON.stringify(observation.wire);
}
