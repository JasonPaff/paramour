import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "@/app/docs/[[...slug]]/route.def";

const sample = `import { defineAppRoute, href, p } from "paramour";

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { q: p.string().optional() },
});

// typed, validated, explicit: "/product/42?q=paramour"
href(productRoute, { params: { id: 42 }, search: { q: "paramour" } });`;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <h1 className="text-5xl font-bold tracking-tight">paramour</h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">
        Type-safe routing companion for the Next.js App Router — validated route
        and search params, typed path building, and an explicit URL wire format.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link
          className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          href={href(docsRoute, { params: { slug: ["getting-started"] } })}
        >
          Get started
        </Link>
        <Link
          className="rounded-lg border border-fd-border px-5 py-2.5 font-medium transition-colors hover:bg-fd-accent"
          href={href(docsRoute, { params: { slug: ["migrate"] } })}
        >
          Migrate from next-typesafe-url
        </Link>
      </div>
      <pre className="max-w-full overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4 text-left text-sm text-fd-card-foreground">
        <code>{sample}</code>
      </pre>
    </main>
  );
}
