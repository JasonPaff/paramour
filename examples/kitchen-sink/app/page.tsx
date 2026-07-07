import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { eventsRoute } from "./events/[date]/route.def";
import { filesRoute } from "./files/[...path]/route.def";
import { findRoute } from "./find/route.def";
import { productsRoute } from "./products/[id]/route.def";
import { serializeRoute } from "./serialize/route.def";

// The hub: one href()-built link per demo route, each annotated with the
// paramour surface it exercises. Every link below is a branded Href fed
// straight into next/link.
export default function HomePage() {
  return (
    <main>
      <h1>paramour — kitchen sink</h1>
      <p>
        Every codec, modifier, route shape, parse surface, client hook, and
        serialization function, spread across the routes below. Routes are
        defined once in colocated <code>route.def.ts</code> files.
      </p>

      <h2>Routes</h2>
      <ul>
        <li>
          <Link
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
          </Link>{" "}
          — single <code>[id]</code> (Zod-refined integer); search covering
          string/integer/number/boolean/enum/stringArray with{" "}
          <code>.default()</code>/<code>.optional()</code>/<code>.catch()</code>
          ; server <code>parse</code> + client hooks.
        </li>
        <li>
          <Link
            href={href(docsRoute, { params: { slug: ["guides", "intro"] } })}
          >
            /docs/guides/intro
          </Link>{" "}
          — optional catch-all <code>[[...slug]]</code>; <code>safeParse</code>{" "}
          → <code>notFound()</code>.
        </li>
        <li>
          <Link
            href={href(filesRoute, { params: { path: ["src", "index.ts"] } })}
          >
            /files/src/index.ts
          </Link>{" "}
          — required catch-all <code>[...path]</code>;{" "}
          <code>safeParseParams</code>.
        </li>
        <li>
          <Link
            href={href(eventsRoute, {
              params: { date: new Date("2026-07-06") },
              search: { attempts: 3, ref: ["a", "b"] },
            })}
          >
            /events/2026-07-06
          </Link>{" "}
          — <code>isoDate</code> param; <code>timestamp</code>/<code>json</code>
          /<code>custom</code> search with factory <code>.default()</code>/
          <code>.catch()</code>; <code>parseParams</code> +{" "}
          <code>safeParseSearch</code> + throwing client hooks.
        </li>
        <li>
          <Link
            href={href(findRoute, { search: { q: "cable", tags: ["a", "b"] } })}
          >
            /find?q=cable
          </Link>{" "}
          — <code>rawSearch</code> whole-object schema escape hatch;{" "}
          <code>parseSearch</code>.
        </li>
        <li>
          <Link href={href(serializeRoute)}>/serialize</Link> — interactive{" "}
          <code>buildPath</code>/<code>encodeSearch</code>/
          <code>decodeSearch</code>/<code>buildSearchString</code>/
          <code>searchToString</code> plus the error hierarchy, live in the
          browser.
        </li>
      </ul>

      <h2>Decode failures</h2>
      <ul>
        <li>
          {/* parse() throws → the colocated error.tsx boundary. */}
          <a href="/products/not-a-number">/products/not-a-number</a> — fails
          the integer grammar.
        </li>
        <li>
          {/* The positive-int Zod schema rejects it after the grammar passes. */}
          <a href="/products/-5">/products/-5</a> — parses as an integer, fails
          the positive schema.
        </li>
        <li>
          {/* safeParse → notFound() instead of an error boundary. */}
          <a href="/docs?page=not-a-number">/docs?page=not-a-number</a> — a
          malformed search param becomes a 404.
        </li>
      </ul>
    </main>
  );
}
