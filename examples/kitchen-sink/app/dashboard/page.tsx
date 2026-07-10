import Link from "next/link";
import { href, type RouteProps } from "paramour";

import { dashboardRoute } from "./route.def";

const ranges = ["7d", "30d", "90d"] as const;

// A static route (no dynamic segment) that reads searchParams must opt into
// dynamic rendering, or `next build` fails trying to prerender it (same
// stance as /find and /search).
export const dynamic = "force-dynamic";

export default async function DashboardPage(props: RouteProps) {
  const { search } = await dashboardRoute.parse(props);

  return (
    <section className="section">
      <p className="eyebrow">children slot — decoded on the server</p>
      <p>
        Range: <strong>{search.range}</strong> — switch it and watch the URL
        bar: <code>7d</code> is the default, so it elides (D8) and the canonical
        URL is bare <code>/dashboard</code>.
      </p>
      <div className="pills">
        {ranges.map((range) => (
          <Link
            aria-current={range === search.range ? "true" : undefined}
            className="pill"
            href={href(dashboardRoute, { search: { range } })}
            key={range}
          >
            {range}
          </Link>
        ))}
      </div>
    </section>
  );
}
