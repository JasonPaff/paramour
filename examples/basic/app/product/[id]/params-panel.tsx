"use client";

import { useRouteParams, useSearch } from "@paramour-js/next/app";

import { productRoute } from "./route.def";

// Client-side twin of the server parse in page.tsx (DESIGN §9). The hooks are
// a useMemo over Next's useParams()/useSearchParams(): no loading state, and a
// malformed URL surfaces as the `status: "error"` arm rather than throwing —
// the component renders a fallback instead of crashing.
export function ParamsPanel() {
  const params = useRouteParams(productRoute);
  const search = useSearch(productRoute);

  if (params.status === "error") {
    return (
      <p className="alert" role="alert">
        params: {params.error.message}
      </p>
    );
  }
  if (search.status === "error") {
    return (
      <p className="alert" role="alert">
        search: {search.error.message}
      </p>
    );
  }

  return (
    <section className="panel" id="client-params">
      <h2>Read on the client</h2>
      <dl className="kv">
        <dt>
          <code>params.id</code>
        </dt>
        <dd>
          {params.data.id} (typeof {typeof params.data.id})
        </dd>
        <dt>
          <code>search.page</code>
        </dt>
        <dd>{search.data.page}</dd>
        <dt>
          <code>search.q</code>
        </dt>
        <dd>{search.data.q ?? "(not provided — optional)"}</dd>
      </dl>
    </section>
  );
}
