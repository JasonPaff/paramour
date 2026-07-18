/**
 * The panel's entire stylesheet (design-12 DT14/DT16–DT18), rendered as an
 * inline `<style>` element by the panel root — no stylesheet import, no
 * CSS-in-JS dependency, zero runtime deps. All selectors are `.pmr-`
 * prefixed, so duplicate injection (two panels) is harmless. CSP note: an
 * inline `<style>` needs `style-src 'unsafe-inline'` or a nonce —
 * acceptable for a dev-only tool, documented rather than solved in v1.
 *
 * Theming (DT14): the shell's `theme` prop lands as a `data-theme`
 * attribute on `.pmr-root`; the custom-property token set below flips with
 * it — no theme context, no remount. Violet/indigo accent is paramour's
 * own; the four status colors follow devtool traffic-light convention
 * (DT16). Density and the monospace wire stack per DT17; the only motion
 * is the ~400ms row flash plus the copy-button glyph swap (DT18).
 */
export const PANEL_CSS = `
.pmr-root {
  --pmr-accent: #6d5ae6;
  --pmr-accent-soft: #6d5ae62e;
  --pmr-bg: #ffffff;
  --pmr-bg-raised: #f6f5fb;
  --pmr-border: #e2e0ef;
  --pmr-flash-duration: 400ms;
  --pmr-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --pmr-font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
  --pmr-status-error: #e5484d;
  --pmr-status-ok: #30a46c;
  --pmr-status-pending: #f5a524;
  --pmr-status-stale: #8f8f8f;
  --pmr-text: #232130;
  --pmr-text-muted: #6f6c85;

  background: var(--pmr-bg);
  color: var(--pmr-text);
  display: flex;
  font-family: var(--pmr-font-ui);
  font-size: 12px;
  height: 100%;
  line-height: 1.45;
  min-height: 0;
  overflow: hidden;
  width: 100%;
}
.pmr-root[data-theme="dark"] {
  --pmr-accent: #8b7cf0;
  --pmr-accent-soft: #8b7cf03d;
  --pmr-bg: #17151f;
  --pmr-bg-raised: #201d2b;
  --pmr-border: #322e42;
  --pmr-status-error: #ff6369;
  --pmr-status-ok: #3dd68c;
  --pmr-status-pending: #ffb224;
  --pmr-status-stale: #7c7c7c;
  --pmr-text: #eceaf4;
  --pmr-text-muted: #9b97ad;
}

.pmr-sidebar {
  border-right: 1px solid var(--pmr-border);
  flex: 0 0 190px;
  overflow-y: auto;
  padding: 6px 0;
}
.pmr-sidebar-entry {
  align-items: center;
  background: none;
  border: none;
  color: var(--pmr-text);
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 6px;
  padding: 4px 10px;
  text-align: left;
  width: 100%;
}
.pmr-sidebar-entry:hover {
  background: var(--pmr-bg-raised);
}
.pmr-sidebar-entry[data-selected="true"] {
  background: var(--pmr-accent-soft);
}
.pmr-sidebar-entry[data-stale="true"] {
  opacity: 0.55;
}
.pmr-sidebar-path {
  font-family: var(--pmr-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pmr-main {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding: 8px 12px 16px;
}

.pmr-banner {
  align-items: center;
  background: var(--pmr-bg-raised);
  border: 1px solid var(--pmr-border);
  border-radius: 6px;
  display: flex;
  gap: 8px;
  margin: 8px 0 6px;
  padding: 6px 10px;
}
.pmr-banner-path {
  font-family: var(--pmr-font-mono);
  font-size: 13px;
  font-weight: 600;
}
.pmr-badge {
  border: 1px solid var(--pmr-border);
  border-radius: 999px;
  color: var(--pmr-text-muted);
  font-size: 10px;
  padding: 0 6px;
  text-transform: uppercase;
}
.pmr-stale-badge {
  color: var(--pmr-status-stale);
  font-size: 10px;
  text-transform: uppercase;
}

.pmr-dot {
  align-items: center;
  display: inline-flex;
  flex: none;
  gap: 3px;
}
.pmr-dot::before {
  border-radius: 50%;
  content: "";
  display: inline-block;
  height: 8px;
  width: 8px;
}
.pmr-dot--error::before { background: var(--pmr-status-error); }
.pmr-dot--ok::before { background: var(--pmr-status-ok); }
.pmr-dot--pending::before { background: var(--pmr-status-pending); }
.pmr-dot--stale::before { background: var(--pmr-status-stale); }
.pmr-dot-glyph {
  font-size: 10px;
}
.pmr-dot--error .pmr-dot-glyph { color: var(--pmr-status-error); }
.pmr-dot--ok .pmr-dot-glyph { color: var(--pmr-status-ok); }
.pmr-dot--pending .pmr-dot-glyph { color: var(--pmr-status-pending); }
.pmr-dot--stale .pmr-dot-glyph { color: var(--pmr-status-stale); }

.pmr-section-title {
  color: var(--pmr-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  margin: 10px 0 2px;
  text-transform: uppercase;
}
.pmr-table {
  border-collapse: collapse;
  width: 100%;
}
.pmr-table th {
  border-bottom: 1px solid var(--pmr-border);
  color: var(--pmr-text-muted);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px 2px 0;
  text-align: left;
  text-transform: uppercase;
}
.pmr-table td {
  border-bottom: 1px solid var(--pmr-border);
  height: 22px;
  padding: 2px 8px 2px 0;
  vertical-align: middle;
}
.pmr-mono {
  font-family: var(--pmr-font-mono);
}
.pmr-muted {
  color: var(--pmr-text-muted);
}
@keyframes pmr-flash {
  from { background-color: var(--pmr-accent-soft); }
  to { background-color: transparent; }
}
.pmr-flash {
  animation: pmr-flash var(--pmr-flash-duration) ease-out;
}
.pmr-tag {
  border: 1px solid var(--pmr-border);
  border-radius: 3px;
  color: var(--pmr-text-muted);
  font-size: 10px;
  padding: 0 4px;
}

.pmr-input,
.pmr-select,
.pmr-textarea {
  background: var(--pmr-bg);
  border: 1px solid var(--pmr-border);
  border-radius: 4px;
  color: var(--pmr-text);
  font-family: var(--pmr-font-mono);
  font-size: 11px;
  max-width: 180px;
  padding: 1px 4px;
  width: 100%;
}
.pmr-textarea {
  min-height: 34px;
  resize: vertical;
}
.pmr-input:focus,
.pmr-select:focus,
.pmr-textarea:focus {
  border-color: var(--pmr-accent);
  outline: none;
}
.pmr-icon-button {
  background: none;
  border: 1px solid var(--pmr-border);
  border-radius: 4px;
  color: var(--pmr-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  padding: 1px 6px;
}
.pmr-icon-button:hover {
  border-color: var(--pmr-accent);
  color: var(--pmr-text);
}
.pmr-icon-button[data-active="true"] {
  border-color: var(--pmr-accent);
  color: var(--pmr-accent);
}
.pmr-preview {
  font-family: var(--pmr-font-mono);
  font-size: 10px;
}
.pmr-preview--error {
  color: var(--pmr-status-error);
}
.pmr-preview--ok {
  color: var(--pmr-text-muted);
}

.pmr-issues {
  border: 1px solid var(--pmr-status-error);
  border-radius: 6px;
  margin-top: 10px;
  padding: 6px 10px;
}
.pmr-issues .pmr-section-title {
  color: var(--pmr-status-error);
  margin-top: 0;
}

.pmr-empty {
  color: var(--pmr-text-muted);
  font-style: italic;
  margin: auto;
  padding: 24px;
  text-align: center;
}

.pmr-toolbar {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
`;
