import type { ReactNode } from "react";
import { Suspense } from "react";

// Parallel routes: @stats is a SLOT, not a URL segment — Next hands it to
// this layout as a prop beside children, and no URL ever routes to
// /dashboard/@stats. The scanner skips the @stats subtree the same way (TR2),
// so the artifact carries /dashboard and nothing else.
export default function DashboardLayout({
  children,
  stats,
}: {
  children: ReactNode;
  stats: ReactNode;
}) {
  return (
    <main>
      <h1>Dashboard</h1>
      <p className="lede">
        Two parallel surfaces — the page (left, server) and the{" "}
        <code>@stats</code> slot (right, client) — rendered side by side and
        decoding the <em>same</em> typed search state from one URL.
      </p>
      <div className="split">
        <div>{children}</div>
        {/* The slot reads useSearchParams on the client; the boundary keeps
            /dashboard statically prerenderable (same move as the root
            layout's UrlBar). */}
        <aside>
          <Suspense fallback={null}>{stats}</Suspense>
        </aside>
      </div>
    </main>
  );
}
