"use client";

import { useSearch } from "@paramour-js/next/app";

import { dashboardRoute } from "../route.def";

// Deterministic fake series so the slot visibly reacts to the range without
// a data layer — the demo is the shared URL state, not the numbers.
const days = { "7d": 7, "30d": 30, "90d": 90 } as const;

// A slot page consuming the SAME route def as the page beside it. This file
// is invisible to the scanner (the whole @stats subtree is skipped, TR2), yet
// the typed hooks work unchanged: the def is an imported object, not a
// registry lookup keyed on this file's path.
export default function StatsSlot() {
  const search = useSearch(dashboardRoute);

  // The safe hook: a hand-edited ?range=1y decodes to the error arm here (and
  // in the page's server parse) instead of crashing the slot.
  if (search.status === "error") {
    return (
      <section className="panel">
        <p className="alert" role="alert">
          stats: {search.error.message}
        </p>
      </section>
    );
  }

  const span = days[search.data.range];

  return (
    <section className="panel">
      <h2>@stats slot</h2>
      <p className="eyebrow">decoded on the client with useSearch()</p>
      <dl className="kv">
        <dt>
          <code>search.range</code>
        </dt>
        <dd>{search.data.range}</dd>
        <dt>events (fake)</dt>
        <dd>{span * 12}</dd>
        <dt>visitors (fake)</dt>
        <dd>{span * 340}</dd>
      </dl>
    </section>
  );
}
