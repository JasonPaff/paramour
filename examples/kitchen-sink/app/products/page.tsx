import { Suspense } from "react";

import { FilterPanel } from "./filter-panel";

// The other sanctioned shape for a static route that reads search params:
// /find opts the whole route into dynamic rendering (force-dynamic); here the
// reading happens in a client component behind a Suspense boundary, so the
// page itself stays statically prerenderable.
export default function ProductsPage() {
  return (
    <main>
      <h1>Products</h1>
      <p className="lede">
        The idiomatic filter page: form controls round-trip through the URL.{" "}
        <code>useSearch</code> decodes the current filters, every edit builds a
        typed <code>href()</code> and hands it to{" "}
        <code>router.replace(...)</code>, and the hooks re-decode what comes
        back. The URL bar above is the single source of truth.
      </p>
      <Suspense fallback={<section className="panel" />}>
        <FilterPanel />
      </Suspense>
    </main>
  );
}
