import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { productRoute } from "./product/[id]/route.def";

export default function HomePage() {
  return (
    <main>
      <h1>paramour — basic example</h1>
      <p className="lede">
        Routes are defined once in colocated <code>route.def.ts</code> files;
        pages decode their props with <code>route.parse()</code> and links are
        assembled with <code>href()</code>.
      </p>

      <p className="eyebrow">Routes</p>
      <ul className="cards">
        <li className="card">
          <Link
            className="card__path"
            href={href(productRoute, {
              hash: "reviews",
              params: { id: 42 },
              search: { page: 2, q: "cable" },
            })}
          >
            /product/42?page=2&amp;q=cable#reviews
          </Link>
          <p>
            Product #42, page 2, searching “cable”, jumping to #reviews. Decoded
            on the server, then re-read on the client.
          </p>
          <div className="pills">
            <span className="pill">integer</span>
            <span className="pill">.default()</span>
            <span className="pill">.optional()</span>
            <span className="pill">parse</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(docsRoute, { params: { slug: ["guides", "codecs"] } })}
          >
            /docs/guides/codecs
          </Link>
          <p>
            An optional catch-all that matches with or without segments; a
            decode failure becomes a 404.
          </p>
          <div className="pills">
            <span className="pill">[[...slug]]</span>
            <span className="pill">safeParse</span>
            <span className="pill">notFound()</span>
          </div>
        </li>
      </ul>

      <p className="eyebrow">Decode failures</p>
      <ul className="chips">
        <li className="chip">
          {/* Decoding failures throw to the nearest error boundary. */}
          <a href="/product/not-a-number">/product/not-a-number</a>
          <span>throws to the colocated error boundary.</span>
        </li>
        <li className="chip">
          {/* safeParse demo: the docs page turns decode errors into a 404. */}
          <a href="/docs?page=not-a-number">/docs?page=not-a-number</a>
          <span>a malformed search param becomes a 404.</span>
        </li>
      </ul>
    </main>
  );
}
