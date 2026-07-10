import { useRouteParams, useSearch } from "@paramour-js/next/pages";

import { productRoute } from "../lib/routes";

// Client-side twin of the server parse in pages/products/[id].tsx. The pages
// hooks read useRouter().query, so their result is THREE-state: this page has
// getServerSideProps, and on a GSSP page the first render is already
// isReady with a populated query (design-06 spike 3) — the pending arm never
// surfaces here, but the type still makes us say what it would render. See
// /find for a page where it actually shows.
export function ProductPanel() {
  const params = useRouteParams(productRoute);
  const search = useSearch(productRoute);

  if (params.status === "pending" || search.status === "pending") {
    return <p className="eyebrow">waiting for the router…</p>;
  }
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
