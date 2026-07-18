import type { RouteProps } from "paramour";

import Link from "next/link";
import { href } from "paramour";

import { Controls } from "./controls";
import { interopRoute } from "./route.def";

// Reads searchParams on a static route — must opt into dynamic rendering
// (same as /find and /search).
export const dynamic = "force-dynamic";

// The division of labor (NQ11): this server component is the LOUD, branded
// failure surface — the route decode sees the same URL the client parsers
// read and reports real grammar violations with per-key issues. The client
// side (Controls) is nuqs's territory: high-frequency URL state where a
// malformed value is recoverable UI (null / the codec's .catch value), never
// a crash.
export default async function InteropPage(props: RouteProps) {
  const result = await interopRoute.safeParseSearch(props);

  return (
    <main>
      <h1>nuqs interop</h1>
      <p className="lede">
        One route definition, two consumers: the server decode below and the
        client controls&apos; nuqs parsers are both derived from{" "}
        <code>interopRoute</code>&apos;s codecs via{" "}
        <code>@paramour-js/nuqs</code> — presence, defaults, catch recovery, and
        equality declared exactly once.
      </p>

      <section className="panel">
        <h2>Server decode — the route contract</h2>
        {result.status === "error" ? (
          <>
            <p className="alert" role="alert">
              {result.error.message}
            </p>
            <p className="hint">
              The server decode is the loud surface: hand-edit the URL to
              something malformed (<code>?page=abc</code>, or a duplicated
              scalar like <code>?page=1&amp;page=2</code>) and the branded error
              names the offense — while the client controls below keep
              rendering, reading null for what they cannot parse (NQ7).{" "}
              <Link href={href(interopRoute)}>Reset to the clean URL</Link>.
            </p>
          </>
        ) : (
          <dl className="pairs">
            <dt>labels</dt>
            <dd>
              <code>{JSON.stringify(result.data.labels)}</code>
            </dd>
            <dt>page</dt>
            <dd>
              <code>{result.data.page}</code>
            </dd>
            <dt>q</dt>
            <dd>
              <code>{JSON.stringify(result.data.q) ?? "undefined"}</code>
            </dd>
            <dt>since</dt>
            <dd>
              <code>
                {result.data.since === undefined
                  ? "undefined"
                  : result.data.since.toISOString()}
              </code>
            </dd>
            <dt>tags</dt>
            <dd>
              <code>{JSON.stringify(result.data.tags)}</code>
            </dd>
          </dl>
        )}
      </section>

      <Controls />

      <p className="hint">
        Two documented read-path asymmetries (NQ6/NQ7): a duplicated scalar key
        is a decode error server-side but nuqs reads the first value; and a
        factory default (<code>.default(() =&gt; …)</code>) derives a nullable
        parser — absent reads <code>null</code> client-side, apply the factory
        at the read site.
      </p>
    </main>
  );
}
