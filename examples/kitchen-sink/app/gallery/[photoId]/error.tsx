"use client";

// parseParams throws on decode failure; the App Router delivers it to the
// nearest error boundary (DESIGN §8). Visit /gallery/not-a-number to land
// here — from the full page OR from the intercepted modal, since both decode
// through the same def.
export default function PhotoError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main>
      <h1>That photo URL didn&#39;t decode</h1>
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
