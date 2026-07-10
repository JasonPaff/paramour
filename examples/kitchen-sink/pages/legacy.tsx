import { useSearch } from "@paramour-js/next/pages";
import Link from "next/link";
import { href } from "paramour";

import { homeRoute } from "../app/route.def";
import { legacyRoute } from "../lib/legacy.def";

// PR1 end-to-end: a Pages Router route living beside the app/ tree. One
// artifact registers both unions (appRoutes + pagesRoutes), the hooks import
// from @paramour-js/next/pages (the app/ components use /app), and href()
// links across the router boundary in both directions.
export default function LegacyPage() {
  const search = useSearch(legacyRoute);

  return (
    <main>
      <h1>Legacy (Pages Router)</h1>
      <p className="lede">
        This page is served by the Pages Router while everything else in this
        example lives under <code>app/</code>. Its search params are read with{" "}
        <code>useSearch</code> from <code>@paramour-js/next/pages</code> —
        three-state, because this page is statically optimized and the first
        client render predates <code>router.isReady</code>.
      </p>

      {search.status === "pending" ? (
        <p className="eyebrow">waiting for the router…</p>
      ) : search.status === "error" ? (
        <p className="alert" role="alert">
          search: {search.error.message}
        </p>
      ) : (
        <dl className="kv">
          <dt>
            <code>search.ref</code> — <code>p.string().optional()</code>
          </dt>
          <dd>{search.data.ref ?? "(not provided — optional)"}</dd>
        </dl>
      )}

      <p>
        <Link href={href(homeRoute)}>← back to the App Router side</Link>
      </p>
    </main>
  );
}
