import type { Metadata } from "next";
import type { RouteProps } from "paramour";

import { ParamsPanel } from "./params-panel";
import { productRoute } from "./route.def";

// parse/parseParams work identically in generateMetadata (DESIGN §8).
export async function generateMetadata(props: RouteProps): Promise<Metadata> {
  const { id } = await productRoute.parseParams(props);
  return { title: `Product #${String(id)}` };
}

// props are typed with paramour's RouteProps — Next's promised
// params/searchParams are structurally assignable to it.
export default async function ProductPage(props: RouteProps) {
  // Throws on a malformed URL (e.g. /product/not-a-number) — caught by the
  // colocated error.tsx boundary.
  const { params, search } = await productRoute.parse(props);

  return (
    <main>
      <h1>Product #{params.id}</h1>
      <dl>
        <dt>
          <code>params.id</code>
        </dt>
        <dd>
          {params.id} (typeof {typeof params.id})
        </dd>
        <dt>
          <code>search.page</code>
        </dt>
        <dd>{search.page} (defaults to 1 when absent)</dd>
        <dt>
          <code>search.q</code>
        </dt>
        <dd>{search.q ?? "(not provided — optional)"}</dd>
      </dl>
      <ParamsPanel />
      <section id="reviews">
        <h2>Reviews</h2>
        <p>The #reviews hash on the home page link lands here.</p>
      </section>
    </main>
  );
}
