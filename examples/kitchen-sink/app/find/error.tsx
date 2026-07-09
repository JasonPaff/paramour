"use client";

// parseSearch() throws SearchDecodeError on a schema failure (try ?page=abc).
export default function FindError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main>
      <h1>That search didn&#39;t validate</h1>
      <p className="eyebrow">SearchDecodeError</p>
      <pre className="trace trace--error">{error.message}</pre>
      <p>
        <button className="btn" onClick={reset} type="button">
          Try again
        </button>
      </p>
    </main>
  );
}
