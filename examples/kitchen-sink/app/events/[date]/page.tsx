import type { RouteProps } from "paramour";

import { encodeStaticParams } from "paramour";

import { eventDates } from "./dates";
import { EventsPanel } from "./events-panel";
import { eventsRoute } from "./route.def";

// Typed serialization at the static boundary: a real Date in,
// { date: "2026-07-10" } out — p.isoDate's wire grammar, so the enumerated
// URLs can never disagree with what parseParams accepts. This page ALSO reads
// searchParams, so at prerender time Next rejects that promise with its
// dynamic-usage sentinel and bails each path back to request-time rendering —
// which parseSearch must let through unwrapped (the digest passthrough) or
// the bailout becomes a build failure. /gallery/[photoId] is the fully-static
// twin that actually prerenders.
export function generateStaticParams() {
  return eventDates.map((date) => encodeStaticParams(eventsRoute, { date }));
}

export default async function EventsPage(props: RouteProps) {
  // parseParams throws on a malformed date (/events/2026-13-01) → error.tsx.
  const { date } = await eventsRoute.parseParams(props);
  // safeParseSearch keeps the search half non-throwing: the .catch()/.default()
  // keys recover on their own, and anything left surfaces as error.issues.
  const search = await eventsRoute.safeParseSearch(props);

  return (
    <main>
      <h1>Event on {date.toISOString().slice(0, 10)}</h1>
      <p className="lede">
        <code>params.date</code> — <code>p.isoDate()</code> → a real{" "}
        <code>Date</code> ({date.toISOString()}).
      </p>
      {search.status === "error" ? (
        <ul className="issues">
          {search.error.issues.map((issue) => (
            <li key={issue.key}>
              <code>{issue.key}</code>: {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <dl className="kv">
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
