import type { ReactNode } from "react";

import type { RouteSession } from "../store.js";

import { RouterBadge, StatusDot } from "./primitives.js";

/**
 * DT10/DT15's session rail: every route observed this session in
 * first-observed order — route pattern, router micro-badge, last-status dot
 * (gray/stale when not matching the current URL). Selecting an entry pins
 * it; selecting the pinned entry again returns to auto-follow-current.
 */
export function Sidebar({
  currentKeys,
  onSelect,
  selectedKey,
  sessions,
}: {
  readonly currentKeys: readonly string[];
  readonly onSelect: (key: null | string) => void;
  readonly selectedKey: null | string;
  readonly sessions: readonly RouteSession[];
}): ReactNode {
  return (
    <nav aria-label="observed routes" className="pmr-sidebar">
      {sessions.map((session) => {
        const current = currentKeys.includes(session.key);
        const selected =
          selectedKey === null ? current : selectedKey === session.key;
        return (
          <button
            className="pmr-sidebar-entry"
            data-selected={selected}
            data-stale={!current}
            key={session.key}
            onClick={() => {
              onSelect(selectedKey === session.key ? null : session.key);
            }}
            type="button"
          >
            <StatusDot status={current ? session.status : "stale"} />
            <span className="pmr-sidebar-path">{session.route.path}</span>
            <RouterBadge
              router={
                session.params?.routerKind ??
                session.search?.routerKind ??
                "app"
              }
            />
          </button>
        );
      })}
    </nav>
  );
}
