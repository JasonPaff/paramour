"use client";

// route.parse() throws on decode failure; the App Router delivers it to the
// nearest error boundary (DESIGN §8). Visit /products/not-a-number or
// /products/-5 to land here.
export default function ProductError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main>
      <h1>That product URL didn&#39;t decode</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
