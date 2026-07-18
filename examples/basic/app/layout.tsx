import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Devtools } from "./devtools";
import { Nav } from "./nav";

export const metadata: Metadata = {
  description:
    "Canonical minimal example of paramour: typed routes, params, and search params for the Next.js App Router.",
  title: "paramour — basic example",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Nav />
          </header>
          {children}
        </div>
        <Devtools />
      </body>
    </html>
  );
}
