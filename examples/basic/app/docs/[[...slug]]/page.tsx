import { notFound } from "next/navigation";
import type { RouteProps } from "paramour";

import { docsRoute } from "./route.def";

export default async function DocsPage(props: RouteProps) {
  // safeParse never throws on decode errors: data XOR error. Here a
  // malformed URL (e.g. /docs?page=not-a-number) becomes a 404 instead of
  // reaching the error boundary.
  const result = await docsRoute.safeParse(props);
  if (result.error) notFound();

  const { params, search } = result.data;

  return (
    <main>
      <h1>Docs: {params.slug.join("/") || "index"}</h1>
      <p className="lede">
        <code>params.slug</code> is an optional catch-all — an empty array at{" "}
        <code>/docs</code>, segments otherwise.
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
        <dd>{search.page ?? "(not provided)"}</dd>
      </dl>
    </main>
  );
}
