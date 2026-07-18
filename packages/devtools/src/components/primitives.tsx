import type { RouterKind } from "paramour";
import type { ReactNode } from "react";

import { useState } from "react";

/** Shared leaf components (design-12 DT16/DT18). */

export type PanelStatus = "error" | "ok" | "pending" | "stale";

/**
 * DT16: colorblind-safe glyph shapes layered ON TOP of the color dots, not
 * replacing them — the at-a-glance color read stays, the glyph carries the
 * same information without color.
 */
const STATUS_GLYPHS: Record<PanelStatus, string> = {
  error: "✕",
  ok: "✓",
  pending: "◷",
  stale: "∅",
};

/** Neutral (never a status color) per-key attribution tag (DT16). */
export function AttributionTag({
  kind,
}: {
  readonly kind: "catch" | "default";
}): ReactNode {
  return <span className="pmr-tag">{kind}</span>;
}

/**
 * DT18: inline micro-feedback — the label swaps to a checkmark briefly; no
 * toasts. Clipboard failure (denied permission, no focus) is silently
 * tolerated: a copy button that sometimes needs a second click beats a
 * crashing panel.
 */
export function CopyButton({
  label,
  text,
}: {
  readonly label: string;
  readonly text: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="pmr-icon-button"
      onClick={() => {
        try {
          void navigator.clipboard.writeText(text).catch(() => undefined);
        } catch {
          // No clipboard API in this environment — the swap still signals.
        }
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1200);
      }}
      type="button"
    >
      {copied ? "✓" : label}
    </button>
  );
}

/**
 * DT18: the pre-observation state is EXPECTED, not a problem — styled as
 * informational, never as an error.
 */
export function EmptyState(): ReactNode {
  return (
    <div className="pmr-empty">
      No routes observed yet — navigate using a paramour hook to see it here.
    </div>
  );
}

export function RouterBadge({
  router,
}: {
  readonly router: RouterKind;
}): ReactNode {
  return <span className="pmr-badge">{router}</span>;
}

export function StatusDot({
  status,
}: {
  readonly status: PanelStatus;
}): ReactNode {
  return (
    <span
      aria-label={status}
      className={`pmr-dot pmr-dot--${status}`}
      role="img"
    >
      <span aria-hidden="true" className="pmr-dot-glyph">
        {STATUS_GLYPHS[status]}
      </span>
    </span>
  );
}

/**
 * Monospace value cell (DT17). The React `key` carries the store's
 * change-stamp, so a parsed-value change remounts the span and restarts the
 * DT18 flash animation; stamp 0 (first appearance) doesn't flash.
 */
export function ValueCell({
  children,
  stamp,
}: {
  readonly children: ReactNode;
  readonly stamp: number;
}): ReactNode {
  return (
    <span className={stamp > 0 ? "pmr-flash pmr-mono" : "pmr-mono"} key={stamp}>
      {children}
    </span>
  );
}
