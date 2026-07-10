"use client";

import { useRouteParams, useSearch } from "@paramour-js/next/app";

import { productsRoute } from "./route.def";

// Client-side twin of the server parse in page.tsx (DESIGN §9). The SAFE hooks
// are a useMemo over Next's useParams()/useSearchParams(): no loading state,
// and a malformed URL surfaces as the `status: "error"` arm rather than
// throwing — the component renders a fallback instead of crashing the tree.
export function ParamsPanel() {
  const params = useRouteParams(productsRoute);
  const search = useSearch(productsRoute);

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
    <section className="panel">
      <h2>Read on the client</h2>
      <dl className="kv">
        <dt>
          <code>useRouteParams</code> → id
        </dt>
        <dd>
          {params.data.id} (typeof {typeof params.data.id})
        </dd>
        <dt>
          <code>useSearch</code> → page / sort
        </dt>
        <dd>
          {search.data.page} / {search.data.sort}
        </dd>
        <dt>
          <code>useSearch</code> → tags
        </dt>
        <dd>{search.data.tags.join(", ") || "(empty array)"}</dd>
      </dl>
    </section>
  );
}
