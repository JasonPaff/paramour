"use client";

import { useRouteParamsOrThrow, useSearchOrThrow } from "@paramour-js/next/app";

import { eventsRoute } from "./route.def";

// The THROWING client hooks — twins of the safe useRouteParams/useSearch. On a
// malformed URL they throw the decode error during render, to the nearest
// client error boundary (error.tsx here), rather than returning `{ error }`.
export function EventsPanel() {
  const { date } = useRouteParamsOrThrow(eventsRoute);
  const search = useSearchOrThrow(eventsRoute);

  return (
    <section className="panel">
      <h2>Read on the client (throwing hooks)</h2>
      <dl className="kv">
        <dt>
          <code>useRouteParamsOrThrow</code> → date
        </dt>
        <dd>{date.toISOString()}</dd>
        <dt>
          <code>useSearchOrThrow</code> → attempts / ref
        </dt>
        <dd>
          {search.attempts} / {(search.ref ?? []).join(", ") || "(empty)"}
        </dd>
      </dl>
    </section>
  );
}
