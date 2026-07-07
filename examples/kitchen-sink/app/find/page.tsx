import type { RouteProps } from "paramour";

import { findRoute } from "./route.def";

// A static route (no dynamic segment) that reads searchParams must opt into
// dynamic rendering, or `next build` fails trying to prerender it statically.
// Dynamic-segment routes (products/docs/events) are dynamic already.
export const dynamic = "force-dynamic";

export default async function FindPage(props: RouteProps) {
  // parseSearch on a rawSearch route returns the SCHEMA's inferred output, not
  // a codec-map shape. A schema failure (?page=abc) throws SearchDecodeError →
  // the colocated error.tsx. Every declared field here is optional.
  const search = await findRoute.parseSearch(props);

  return (
    <main>
      <h1>Find</h1>
      <p>
        <code>search</code> came from <code>rawSearch(findSchema)</code> — Zod
        coerced <code>page</code> from a string and normalized <code>tags</code>{" "}
        to an array.
      </p>
      <dl>
        <dt>
          <code>search.q</code>
        </dt>
        <dd>{search.q ?? "(absent)"}</dd>
        <dt>
          <code>search.page</code>
        </dt>
        <dd>
          {search.page ?? "(absent)"}{" "}
          {search.page === undefined ? "" : `(typeof ${typeof search.page})`}
        </dd>
        <dt>
          <code>search.tags</code>
        </dt>
        <dd>{search.tags ? search.tags.join(", ") : "(absent)"}</dd>
      </dl>
    </main>
  );
}
