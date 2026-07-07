import { notFound } from "next/navigation";
import type { RouteProps } from "paramour";

import { docsRoute } from "./route.def";

export default async function DocsPage(props: RouteProps) {
  // safeParse never throws on decode errors: data XOR error. A malformed URL
  // (/docs?page=not-a-number) becomes a 404 instead of reaching an error
  // boundary. `result.error` narrows both arms (the error is always truthy).
  const result = await docsRoute.safeParse(props);
  if (result.error) notFound();

  const { params, search } = result.data;

  return (
    <main>
      <h1>Docs: {params.slug.join("/") || "index"}</h1>
      <p>
        <code>params.slug</code> is an optional catch-all — an empty array at{" "}
        <code>/docs</code>, segments otherwise (Array of {params.slug.length}).
      </p>
      <p>
        <code>search.page</code>: {search.page ?? "(absent — optional)"}
      </p>
    </main>
  );
}
