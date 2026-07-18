import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";

import "./globals.css";
import { Nav } from "./nav";
import { UrlBar } from "./url-bar";

export const metadata: Metadata = {
  description:
    "Kitchen-sink example: every paramour codec, modifier, route shape, parse surface, client hook, and serialization function.",
  title: "paramour — kitchen sink",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* NuqsAdapter is nuqs v2's required provider for the App Router —
            it powers /interop's useQueryStates (NQ12). */}
        <NuqsAdapter>
          <div className="shell">
            <header className="topbar">
              <Nav />
              {/* UrlBar reads useSearchParams; the Suspense boundary keeps the
                  statically prerenderable pages (e.g. /serialize) static. */}
              <Suspense fallback={<div className="wire" />}>
                <UrlBar />
              </Suspense>
            </header>
            {children}
          </div>
        </NuqsAdapter>
      </body>
    </html>
  );
}
