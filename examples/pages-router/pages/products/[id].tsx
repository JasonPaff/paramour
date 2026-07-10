import type { GetServerSideProps, InferGetServerSidePropsType } from "next";

import { ProductPanel } from "../../components/product-panel";
import { productRoute } from "../../lib/routes";

interface ProductProps {
  id: number;
  page: number;
  q: null | string;
}

// The pages server surface (PR10): getServerSideProps hands params and query
// synchronously and pre-merged; parseContext splits them (ctx.params
// authoritative for path params, query minus the segment names as search).
// safeParseContext is `safely`'s shape — a malformed URL is morally a 404
// here, so the error arm becomes notFound instead of a thrown 500.
export const getServerSideProps: GetServerSideProps<ProductProps> = async (
  ctx,
) => {
  const result = productRoute.safeParseContext(ctx);
  if (result.status === "error") return { notFound: true };
  const { params, search } = result.data;
  // Props cross the serialization boundary: undefined is not JSON, so the
  // absent optional becomes an explicit null.
  return { props: { id: params.id, page: search.page, q: search.q ?? null } };
};

export default function ProductPage({
  id,
  page,
  q,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <main>
      <h1>Product #{id}</h1>
      <p className="lede">
        Decoded on the server with <code>route.safeParseContext(ctx)</code> in{" "}
        <code>getServerSideProps</code>. Every value below is its real in-memory
        type, not a raw string.
      </p>
      <p className="eyebrow">Decoded on the server</p>
      <dl className="kv">
        <dt>
          <code>params.id</code>
        </dt>
        <dd>
          {id} (typeof {typeof id})
        </dd>
        <dt>
          <code>search.page</code>
        </dt>
        <dd>{page} (defaults to 1 when absent)</dd>
        <dt>
          <code>search.q</code>
        </dt>
        <dd>{q ?? "(not provided — optional)"}</dd>
      </dl>
      <ProductPanel />
    </main>
  );
}
