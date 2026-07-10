import Link from "next/link";
import { href } from "paramour";

import { findRoute, legacyRoute, productRoute } from "../lib/routes";

export default function HomePage() {
  return (
    <main>
      <h1>paramour — pages-router example</h1>
      <p className="lede">
        Routes are defined once in <code>lib/routes.ts</code> (never inside{" "}
        <code>pages/</code>, where every file is a page);{" "}
        <code>getServerSideProps</code> decodes its context with{" "}
        <code>route.parseContext()</code>, the client reads the same URL with
        the three-state hooks, and links are assembled with <code>href()</code>.
      </p>

      <p className="eyebrow">Routes</p>
      <ul className="cards">
        <li className="card">
          <Link
            className="card__path"
            href={href(productRoute, {
              params: { id: 42 },
              search: { page: 2, q: "cable" },
            })}
          >
            /products/42?page=2&amp;q=cable
          </Link>
          <p>
            Decoded server-side in <code>getServerSideProps</code> with{" "}
            <code>safeParseContext</code> — a malformed URL becomes{" "}
            <code>notFound: true</code> — then re-read on the client with the
            pages hooks (never <code>pending</code> on a GSSP page).
          </p>
          <div className="pills">
            <span className="pill">getServerSideProps</span>
            <span className="pill">safeParseContext</span>
            <span className="pill">hooks</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(findRoute, { search: { q: "cable", tag: ["audio"] } })}
          >
            /find?q=cable&amp;tag=audio
          </Link>
          <p>
            No data fetching, so Next statically optimizes it and the first
            client render has an empty query: <code>useSearch</code> returns its{" "}
            <code>pending</code> arm, then flips to data.
          </p>
          <div className="pills">
            <span className="pill">auto-static</span>
            <span className="pill">pending</span>
            <span className="pill">useSearch</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(legacyRoute, { params: { id: 7 } })}
          >
            /legacy/7
          </Link>
          <p>
            <code>getInitialProps</code> — its context has no{" "}
            <code>params</code>, so <code>parseContext</code> extracts{" "}
            <code>[id]</code> from <code>query</code> by segment name.
          </p>
          <div className="pills">
            <span className="pill">getInitialProps</span>
            <span className="pill">parseContext</span>
          </div>
        </li>
      </ul>

      <p className="eyebrow">Decode failures</p>
      <ul className="chips">
        <li className="chip">
          {/* safeParseContext demo: either malformed half becomes a 404. */}
          <a href="/products/not-a-number">/products/not-a-number</a>
          <span>safeParseContext → a malformed URL becomes a 404.</span>
        </li>
        <li className="chip">
          {/* The hooks surface decode errors as the error arm, no throw. */}
          <a href="/find?max=not-a-number">/find?max=not-a-number</a>
          <span>useSearch renders the error arm instead of throwing.</span>
        </li>
        <li className="chip">
          {/* parseContext is the throwing twin — Next's error page, not 404. */}
          <a href="/legacy/not-a-number">/legacy/not-a-number</a>
          <span>parseContext throws — Next renders its error page.</span>
        </li>
      </ul>
    </main>
  );
}
