import { ImageResponse } from "next/og";

import { OgCard } from "@/components/og-card";

export const alt = "paramour — type-safe routing for the Next.js App Router";
export const contentType = "image/png";
export const size = { height: 630, width: 1200 };

// Site-wide default OG card; routes with a closer colocated image (the docs
// catch-all) override it per page.
export default function Image() {
  return new ImageResponse(
    <OgCard
      description="Validated route and search params, typed path building, and an explicit URL wire format."
      title="paramour"
    />,
    size,
  );
}
