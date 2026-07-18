import type { ReactNode } from "react";

import { useState, useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "../store.js";
import { PANEL_CSS } from "../styles.js";
import { EmptyState } from "./primitives.js";
import { RouteView } from "./route-view.js";
import { Sidebar } from "./sidebar.js";

export interface ParamourDevtoolsPanelProps {
  /**
   * Injected by the TanStack shell (the one contract it guarantees every
   * panel, regardless of framework); selects the DT14 token set via a
   * `data-theme` attribute — no theme context, no remount.
   */
  readonly theme?: "dark" | "light";
}

/**
 * The paramour devtools panel (design-12 DT7/DT10/DT15): session sidebar on
 * the left; the main pane auto-follows the route(s) whose observations
 * match the current URL (layout and page may both report — both render,
 * stacked), or shows a pinned session's last-known snapshot read-only with
 * a stale marker.
 */
export function ParamourDevtoolsPanel({
  theme,
}: ParamourDevtoolsPanelProps): ReactNode {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [selectedKey, setSelectedKey] = useState<null | string>(null);

  const visible =
    selectedKey === null
      ? snapshot.sessions.filter((session) =>
          snapshot.currentKeys.includes(session.key),
        )
      : snapshot.sessions.filter((session) => session.key === selectedKey);

  return (
    <div className="pmr-root" data-theme={theme ?? "light"}>
      <style>{PANEL_CSS}</style>
      {snapshot.sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Sidebar
            currentKeys={snapshot.currentKeys}
            onSelect={setSelectedKey}
            selectedKey={selectedKey}
            sessions={snapshot.sessions}
          />
          <div className="pmr-main">
            {visible.length === 0 ? (
              <div className="pmr-empty">
                No observed route matches the current URL — select one from the
                sidebar to inspect its last-known snapshot.
              </div>
            ) : (
              visible.map((session) => (
                <RouteView
                  key={session.key}
                  session={session}
                  stale={!snapshot.currentKeys.includes(session.key)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
