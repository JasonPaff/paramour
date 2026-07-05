import type { Metadata } from "next";
import Link from "next/link";
import { href } from "paramour";
import type { ReactNode } from "react";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { productRoute } from "./product/[id]/route.def";
import { homeRoute } from "./route.def";

export const metadata: Metadata = {
  description:
    "Canonical minimal example of paramour: typed routes, params, and search params for the Next.js App Router.",
  title: "paramour — basic example",
};

// Every link is built with href(): typed params/search in, a plain string
// out — Href is a string subtype, so it feeds next/link directly.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui",
          margin: "2rem auto",
          maxWidth: "40rem",
        }}
      >
        <nav style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
          <Link href={href(homeRoute)}>Home</Link>
          <Link
            href={href(productRoute, {
              params: { id: 42 },
              search: { q: "paramour" },
            })}
          >
            Product #42
          </Link>
          <Link href={href(docsRoute)}>Docs</Link>
          <Link
            href={href(docsRoute, { params: { slug: ["getting-started"] } })}
          >
            Getting started
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
