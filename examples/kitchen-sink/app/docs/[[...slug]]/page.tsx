import { notFound } from "next/navigation";
import type { RouteProps } from "paramour";

import { docsRoute } from "./route.def";

export default async function DocsPage(props: RouteProps) {
  // safeParse never throws on decode errors: the union discriminates on
  // `status`. A malformed URL (/docs?page=not-a-number) becomes a 404 instead
  // of reaching an error boundary.
  const result = await docsRoute.safeParse(props);
  if (result.status === "error") notFound();

  const { params, search } = result.data;

  return (
    <main>
      <h1>Docs: {params.slug.join("/") || "index"}</h1>
      <p className="lede">
        <code>params.slug</code> is an optional catch-all — an empty array at{" "}
        <code>/docs</code>, segments otherwise (Array of {params.slug.length}).
      </p>
      <p className="eyebrow">Decoded</p>
      <dl className="kv">
        <dt>
          <code>params.slug</code>
        </dt>
        <dd>{params.slug.join(", ") || "(empty array)"}</dd>
        <dt>
          <code>search.page</code>
        </dt>
        <dd>{search.page ?? "(absent — optional)"}</dd>
      </dl>
    </main>
  );
}
