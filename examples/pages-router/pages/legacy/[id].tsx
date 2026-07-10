import type { NextPage, NextPageContext } from "next";

import { legacyRoute } from "../../lib/routes";

interface LegacyProps {
  id: number;
}

// getInitialProps is the oldest data surface still in service, and its
// NextPageContext has NO `params` — even on a dynamic route the path params
// arrive pre-merged into `query`. parseContext handles that shape by
// extracting [id] from query by segment name (PR10), sound because Next's
// own merge gives route params precedence there. This is the throwing twin:
// /legacy/not-a-number throws a decode error and Next renders its error
// page — see pages/products/[id].tsx for safeParseContext → notFound.
const LegacyPage: NextPage<LegacyProps> = ({ id }) => {
  return (
    <main>
      <h1>Legacy #{id}</h1>
      <p className="lede">
        Decoded in <code>getInitialProps</code> with{" "}
        <code>route.parseContext(ctx)</code> — no <code>ctx.params</code> exists
        there, so the path param was extracted from <code>ctx.query</code> by
        name.
      </p>
      <dl className="kv">
        <dt>
          <code>params.id</code>
        </dt>
        <dd>
          {id} (typeof {typeof id})
        </dd>
      </dl>
    </main>
  );
};

LegacyPage.getInitialProps = (ctx: NextPageContext): LegacyProps => {
  const { params } = legacyRoute.parseContext(ctx);
  return { id: params.id };
};

export default LegacyPage;
