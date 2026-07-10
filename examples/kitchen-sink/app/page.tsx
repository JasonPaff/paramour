import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { eventsRoute } from "./events/[date]/route.def";
import { filesRoute } from "./files/[...path]/route.def";
import { findRoute } from "./find/route.def";
import { productsRoute } from "./products/[id]/route.def";
import { productsListRoute } from "./products/route.def";
import { searchRoute } from "./search/route.def";
import { serializeRoute } from "./serialize/route.def";

// The hub: one href()-built link per demo route, each annotated with the
// paramour surface it exercises. Every link below is a branded Href fed
// straight into next/link.
export default function HomePage() {
  return (
    <main>
      <h1>paramour — kitchen sink</h1>
      <p className="lede">
        Every codec, modifier, route shape, parse surface, client hook, and
        serialization function, spread across the routes below. Routes are
        defined once in colocated <code>route.def.ts</code> files. The bar above
        shows the wire form of the current URL; each page shows what paramour
        decoded it into.
      </p>

      <p className="eyebrow">Routes</p>
      <ul className="cards">
        <li className="card">
          <Link
            className="card__path"
            href={href(productsRoute, {
              hash: "client",
              params: { id: 42 },
              search: {
                inStock: true,
                minPrice: 9.99,
                page: 2,
                q: "cable",
                sort: "price",
                tags: ["usb-c", "braided"],
              },
            })}
          >
            /products/42
          </Link>
          <p>
            A single <code>[id]</code> segment refined by Zod, search params
            covering every scalar codec, then the same URL re-read on the
            client.
          </p>
          <div className="pills">
            <span className="pill">integer</span>
            <span className="pill">string</span>
            <span className="pill">number</span>
            <span className="pill">boolean</span>
            <span className="pill">enum</span>
            <span className="pill">stringArray</span>
            <span className="pill">.default()</span>
            <span className="pill">.optional()</span>
            <span className="pill">.catch()</span>
            <span className="pill">parse</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(productsListRoute, {
              search: { sort: "price", tags: ["usb-c"] },
            })}
          >
            /products?sort=price&amp;tags=usb-c
          </Link>
          <p>
            URL-as-state: a filter form that round-trips through the URL.{" "}
            <code>useSearch</code> reads, <code>router.replace(href(...))</code>{" "}
            writes, and defaults elide on the way out.
          </p>
          <div className="pills">
            <span className="pill">useSearch</span>
            <span className="pill">useRouter().replace</span>
            <span className="pill">router.push</span>
            <span className="pill">InferSearchInput</span>
            <span className="pill">D8 elision</span>
            <span className="pill">scroll: false</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(searchRoute, {
              search: { keyword: "cable", tag: ["usb-c"] },
            })}
          >
            /search?keyword=cable
          </Link>
          <p>
            A legacy URL that never renders: the server decodes the old
            vocabulary and forwards it to /products — or, for a moved{" "}
            <Link href={href(searchRoute, { search: { product: 4 } })}>
              deep link
            </Link>
            , permanently to /products/4.
          </p>
          <div className="pills">
            <span className="pill">redirect()</span>
            <span className="pill">permanentRedirect()</span>
            <span className="pill">safeParseSearch</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(docsRoute, { params: { slug: ["guides", "intro"] } })}
          >
            /docs/guides/intro
          </Link>
          <p>
            An optional catch-all that matches with or without segments; a
            decode failure becomes a 404 rather than an error boundary.
          </p>
          <div className="pills">
            <span className="pill">[[...slug]]</span>
            <span className="pill">safeParse</span>
            <span className="pill">notFound()</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(filesRoute, { params: { path: ["src", "index.ts"] } })}
          >
            /files/src/index.ts
          </Link>
          <p>
            A required catch-all — always at least one segment — decoded in
            data-xor-error form.
          </p>
          <div className="pills">
            <span className="pill">[...path]</span>
            <span className="pill">safeParseParams</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(eventsRoute, {
              params: { date: new Date("2026-07-06") },
              search: { attempts: 3, ref: ["a", "b"] },
            })}
          >
            /events/2026-07-06
          </Link>
          <p>
            A path segment that decodes to a real <code>Date</code>, structured
            search values, and the throwing client hooks.
          </p>
          <div className="pills">
            <span className="pill">isoDate</span>
            <span className="pill">timestamp</span>
            <span className="pill">json</span>
            <span className="pill">custom</span>
            <span className="pill">parseParams</span>
            <span className="pill">safeParseSearch</span>
          </div>
        </li>

        <li className="card">
          <Link
            className="card__path"
            href={href(findRoute, { search: { q: "cable", tags: ["a", "b"] } })}
          >
            /find?q=cable
          </Link>
          <p>
            The whole-object escape hatch: hand the entire search object to one
            schema instead of a codec per key.
          </p>
          <div className="pills">
            <span className="pill">rawSearch</span>
            <span className="pill">parseSearch</span>
          </div>
        </li>

        <li className="card">
          <Link className="card__path" href={href(serializeRoute)}>
            /serialize
          </Link>
          <p>
            The framework-agnostic core, live in the browser: type a value,
            watch it become a URL — or a branded error.
          </p>
          <div className="pills">
            <span className="pill">buildPath</span>
            <span className="pill">encodeSearch</span>
            <span className="pill">decodeSearch</span>
            <span className="pill">buildSearchString</span>
            <span className="pill">searchToString</span>
          </div>
        </li>
      </ul>

      <p className="eyebrow">Decode failures</p>
      <ul className="chips">
        <li className="chip">
          {/* parse() throws → the colocated error.tsx boundary. */}
          <a href="/products/not-a-number">/products/not-a-number</a>
          <span>fails the integer grammar.</span>
        </li>
        <li className="chip">
          {/* The positive-int Zod schema rejects it after the grammar passes. */}
          <a href="/products/-5">/products/-5</a>
          <span>parses as an integer, fails the positive schema.</span>
        </li>
        <li className="chip">
          {/* safeParse → notFound() instead of an error boundary. */}
          <a href="/docs?page=not-a-number">/docs?page=not-a-number</a>
          <span>a malformed search param becomes a 404.</span>
        </li>
        <li className="chip">
          {/* The safe hook's error arm renders a reset link, not a crash. */}
          <a href="/products?inStock=maybe">/products?inStock=maybe</a>
          <span>
            fails the boolean grammar; the filter form offers a reset.
          </span>
        </li>
      </ul>
    </main>
  );
}
