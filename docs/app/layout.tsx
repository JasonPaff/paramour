import "./global.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RootProvider } from "fumadocs-ui/provider/next";

export const metadata: Metadata = {
  description: "Type-safe routing companion for the Next.js App Router.",
  title: { default: "paramour", template: "%s | paramour" },
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
