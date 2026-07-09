"use client";

// Boundary for BOTH the server parseParams throw and the throwing client hooks
// in events-panel.tsx (useRouteParamsOrThrow / useSearchOrThrow). Visit
// /events/2026-13-01 to land here.
export default function EventsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main>
      <h1>That event URL didn&#39;t decode</h1>
      <p className="eyebrow">ParamourError</p>
      <pre className="trace trace--error">{error.message}</pre>
      <p>
        <button className="btn" onClick={reset} type="button">
          Try again
        </button>
      </p>
    </main>
  );
}
