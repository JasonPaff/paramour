import type { Metadata } from "next";
import type { RouteProps } from "paramour";

import { ParamsPanel } from "./params-panel";
import { productsRoute } from "./route.def";

// parseParams works identically in generateMetadata (DESIGN §8).
export async function generateMetadata(props: RouteProps): Promise<Metadata> {
  const { id } = await productsRoute.parseParams(props);
  return { title: `Product #${String(id)}` };
}

export default async function ProductPage(props: RouteProps) {
  // Throws on a malformed URL (/products/not-a-number) or a schema failure
  // (/products/-5) — caught by the colocated error.tsx boundary.
  const { params, search } = await productsRoute.parse(props);

  return (
    <main>
      <h1>Product #{params.id}</h1>
      <p>
        Decoded on the server with <code>route.parse(props)</code>. Every value
        below is its real in-memory type, not a raw string.
      </p>
      <dl>
        <dt>
          <code>params.id</code> — <code>p.integer(positiveInt)</code>
        </dt>
        <dd>
          {params.id} (typeof {typeof params.id})
        </dd>
        <dt>
          <code>search.q</code> — <code>p.string(schema).optional()</code>
        </dt>
        <dd>{search.q ?? "(absent — optional)"}</dd>
        <dt>
          <code>search.page</code> — <code>p.integer().default(1)</code>
        </dt>
        <dd>
          {search.page} (defaults to 1; page=1 is elided from built links)
        </dd>
        <dt>
          <code>search.sort</code> —{" "}
          <code>p.enum(...).default(&quot;relevance&quot;).catch(...)</code>
        </dt>
        <dd>{search.sort}</dd>
        <dt>
          <code>search.inStock</code> — <code>p.boolean().optional()</code>
        </dt>
        <dd>
          {search.inStock === undefined
            ? "(absent — optional)"
            : String(search.inStock)}{" "}
          (typeof {typeof search.inStock})
        </dd>
        <dt>
          <code>search.minPrice</code> — <code>p.number().optional()</code>
        </dt>
        <dd>{search.minPrice ?? "(absent — optional)"}</dd>
        <dt>
          <code>search.tags</code> — <code>p.stringArray()</code>
        </dt>
        <dd>
          {search.tags.length > 0 ? search.tags.join(", ") : "(empty array)"}{" "}
          (Array of {search.tags.length})
        </dd>
      </dl>
      <ParamsPanel />
      <section id="client">
        <p>
          The panel above re-decodes the same URL on the client with
          paramour&#39;s hooks — scroll target for the <code>#client</code>{" "}
          hash.
        </p>
      </section>
    </main>
  );
}
