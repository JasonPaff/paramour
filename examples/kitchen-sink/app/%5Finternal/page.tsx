import Link from "next/link";
import { href } from "paramour";

import { aboutRoute } from "../(marketing)/about/route.def";
import { internalRoute } from "../../lib/internal.def";

// This folder is `%5Finternal/` on disk. A plain `_internal/` would be a
// private folder (no route at all); the leading %5F is Next's documented
// escape for "I really do want a URL segment starting with _".
export default function InternalPage() {
  return (
    <main>
      <h1>/_internal</h1>
      <p className="lede">
        Served from <code>app/%5Finternal/page.tsx</code> — the escaped leading
        underscore. The scanner decodes the escape too, so{" "}
        <code>defineAppRoute(&quot;/_internal&quot;, ...)</code> matches and{" "}
        <code>href()</code> builds the real URL:{" "}
        <code>{href(internalRoute)}</code>
      </p>
      <p>
        <Link href={href(aboutRoute, { search: { ref: "_internal" } })}>
          Back to /about
        </Link>{" "}
        — with <code>?ref=_internal</code>, the optional attribution param.
      </p>
    </main>
  );
}
