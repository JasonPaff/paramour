import type { ReactNode } from "react";

import { MarketingBanner } from "./_components/banner";

// The reason route groups exist: a shared layout that never reaches the URL.
// Next strips `(marketing)` when routing and paramour's scanner strips it
// when emitting (TR2), so pages below register under their group-less paths —
// /about, never /(marketing)/about.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <MarketingBanner />
      {children}
    </div>
  );
}
