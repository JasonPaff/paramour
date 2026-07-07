import type { Metadata } from "next";
import Link from "next/link";
import { href } from "paramour";
import type { ReactNode } from "react";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { eventsRoute } from "./events/[date]/route.def";
import { filesRoute } from "./files/[...path]/route.def";
import { findRoute } from "./find/route.def";
import { productsRoute } from "./products/[id]/route.def";
import { homeRoute } from "./route.def";
import { serializeRoute } from "./serialize/route.def";

export const metadata: Metadata = {
  description:
    "Kitchen-sink example: every paramour codec, modifier, route shape, parse surface, client hook, and serialization function.",
  title: "paramour — kitchen sink",
};

// Every link is built with href(): typed params/search in, a plain string out.
// Href is a string subtype, so it feeds next/link directly. A route whose only
// dynamic segment is an optional catch-all (docs) can be linked with no params.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui",
          lineHeight: 1.5,
          margin: "2rem auto",
          maxWidth: "48rem",
          padding: "0 1rem",
        }}
      >
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "2rem",
          }}
        >
          <Link href={href(homeRoute)}>Home</Link>
          <Link href={href(productsRoute, { params: { id: 42 } })}>
            Products
          </Link>
          <Link href={href(docsRoute)}>Docs</Link>
          <Link href={href(filesRoute, { params: { path: ["readme.md"] } })}>
            Files
          </Link>
          {/* isoDate's href input is a Date (the codec's Out), not a string. */}
          <Link
            href={href(eventsRoute, {
              params: { date: new Date("2026-07-06") },
            })}
          >
            Events
          </Link>
          <Link href={href(findRoute, { search: { q: "cable" } })}>Find</Link>
          <Link href={href(serializeRoute)}>Serialize</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
