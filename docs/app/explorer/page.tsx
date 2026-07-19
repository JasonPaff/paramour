import type { Metadata } from "next";

import Link from "next/link";
import { href } from "paramour";
import { Suspense } from "react";

import { docsRoute } from "../docs/[[...slug]]/route.def";
import { Explorer } from "./explorer";

export const metadata: Metadata = {
  description:
    "Compose paramour codecs, type values, and watch the exact URL — or paste a query string and watch it decode.",
  title: "Wire-Format Explorer",
};

// The Suspense boundary is what lets the page statically prerender while the
// explorer itself reads useSearchParams on the client.
export default function ExplorerPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Wire-Format Explorer
        </h1>
        <p className="max-w-2xl text-fd-muted-foreground">
          Compose a search config from real <code>p.*</code> codecs, then watch
          both directions of the wire: typed values serializing into the exact
          URL, and a pasted query string decoding into typed values. Everything
          runs against the shipped library — and the explorer&apos;s own state
          lives in its URL, so sharing the address shares what you see. Rules
          cited below are anchors into the{" "}
          <Link
            className="font-medium text-fd-primary hover:underline"
            href={href(docsRoute, {
              params: { slug: ["reference", "wire-format"] },
            })}
          >
            wire-format spec
          </Link>
          .
        </p>
      </header>
      <Suspense
        fallback={
          <p className="text-sm text-fd-muted-foreground">
            Loading the explorer…
          </p>
        }
      >
        <Explorer />
      </Suspense>
    </main>
  );
}
