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
      <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
