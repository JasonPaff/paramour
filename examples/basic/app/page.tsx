import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { productRoute } from "./product/[id]/route.def";

export default function HomePage() {
  return (
    <main>
      <h1>paramour — basic example</h1>
      <p>
        Routes are defined once in colocated <code>route.def.ts</code> files;
        pages decode their props with <code>route.parse()</code> and links are
        assembled with <code>href()</code>.
      </p>
      <ul>
        <li>
          <Link
            href={href(productRoute, {
              hash: "reviews",
              params: { id: 42 },
              search: { page: 2, q: "cable" },
            })}
          >
            Product #42, page 2, searching “cable”, jumping to #reviews
          </Link>
        </li>
        <li>
          <Link
            href={href(docsRoute, { params: { slug: ["guides", "codecs"] } })}
          >
            Docs: guides/codecs
          </Link>
        </li>
        <li>
          {/* Decoding failures throw to the nearest error boundary. */}
          <a href="/product/not-a-number">A malformed product URL</a>
        </li>
        <li>
          {/* safeParse demo: the docs page turns decode errors into a 404. */}
          <a href="/docs?page=not-a-number">A malformed docs URL</a>
        </li>
      </ul>
    </main>
  );
}
