"use client";

import { useRouteParams, useSearch } from "@paramour-js/next/client";

import { productsRoute } from "./route.def";

// Client-side twin of the server parse in page.tsx (DESIGN §9). The SAFE hooks
// are a useMemo over Next's useParams()/useSearchParams(): no loading state,
// and a malformed URL surfaces as `{ error }` rather than throwing — the
// component renders a fallback instead of crashing the tree.
export function ParamsPanel() {
  const params = useRouteParams(productsRoute);
  const search = useSearch(productsRoute);

  if (params.error) {
    return <p role="alert">params: {params.error.message}</p>;
  }
  if (search.error) {
    return <p role="alert">search: {search.error.message}</p>;
  }

  return (
    <section
      style={{
        borderLeft: "3px solid #888",
        margin: "1rem 0",
        paddingLeft: "1rem",
      }}
    >
      <h2>Read on the client</h2>
      <dl>
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
