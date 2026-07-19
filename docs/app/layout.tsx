import "./global.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RootProvider } from "fumadocs-ui/provider/next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "./" },
  description: "Type-safe routing companion for the Next.js App Router.",
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: "paramour", type: "website" },
  title: { default: "paramour", template: "%s | paramour" },
  twitter: { card: "summary_large_image" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
