import type { RouteProps } from "paramour";

import { EventsPanel } from "./events-panel";
import { eventsRoute } from "./route.def";

export default async function EventsPage(props: RouteProps) {
  // parseParams throws on a malformed date (/events/2026-13-01) → error.tsx.
  const { date } = await eventsRoute.parseParams(props);
  // safeParseSearch keeps the search half non-throwing: the .catch()/.default()
  // keys recover on their own, and anything left surfaces as error.issues.
  const search = await eventsRoute.safeParseSearch(props);

  return (
    <main>
      <h1>Event on {date.toISOString().slice(0, 10)}</h1>
      <p>
        <code>params.date</code> — <code>p.isoDate()</code> → a real{" "}
        <code>Date</code> ({date.toISOString()}).
      </p>
      {search.error ? (
        <ul>
          {search.error.issues.map((issue) => (
            <li key={issue.key}>
              <code>{issue.key}</code>: {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <dl>
          <dt>
            <code>search.at</code> — <code>p.timestamp().optional()</code>
          </dt>
          <dd>{search.data.at ? search.data.at.toISOString() : "(absent)"}</dd>
          <dt>
            <code>search.attempts</code> —{" "}
            <code>p.integer().default(() =&gt; 0)</code>
          </dt>
          <dd>{search.data.attempts} (factory default; never elided)</dd>
          <dt>
            <code>search.coords</code> — <code>p.json(schema).optional()</code>
          </dt>
          <dd>
            {search.data.coords
              ? `lat ${String(search.data.coords.lat)}, lng ${String(search.data.coords.lng)}`
              : "(absent)"}
          </dd>
          <dt>
            <code>search.ref</code> —{" "}
            <code>p.custom(csv).catch(() =&gt; []).optional()</code>
          </dt>
          <dd>
            {search.data.ref
              ? search.data.ref.join(", ") || "(recovered to [])"
              : "(absent — optional)"}
          </dd>
        </dl>
      )}
      <EventsPanel />
    </main>
  );
}
