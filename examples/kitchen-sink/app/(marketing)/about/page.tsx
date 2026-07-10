import Link from "next/link";
import { href, type RouteProps } from "paramour";

import { internalRoute } from "../../../lib/internal.def";
import { aboutRoute } from "./route.def";

// A static route (no dynamic segment) that reads searchParams must opt into
// dynamic rendering, or `next build` fails trying to prerender it (same
// stance as /find and /search).
export const dynamic = "force-dynamic";

export default async function AboutPage(props: RouteProps) {
  const { search } = await aboutRoute.parse(props);

  return (
    <main>
      <h1>About</h1>
      <p className="lede">
        This page lives at <code>app/(marketing)/about/</code>. The group is
        stripped by Next and by the scanner alike, so the typed route is plain{" "}
        <code>/about</code> — the banner above comes from the group&#39;s shared
        layout, and the layout&#39;s <code>_components/</code> folder is skipped
        as a private folder.
      </p>
      <dl className="kv">
        <dt>
          <code>search.ref</code> — <code>p.string().optional()</code>
        </dt>
        <dd>{search.ref ?? "(absent — optional)"}</dd>
      </dl>
      <p>
        <Link href={href(internalRoute)}>/_internal</Link> — a URL segment that
        starts with a literal underscore, served from a{" "}
        <code>%5Finternal/</code> folder via Next&#39;s documented escape.
      </p>
    </main>
  );
}
