import type { NextRequest } from "next/server";

import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { OgCard } from "@/components/og-card";
import { source } from "@/lib/source";

// Per-docs-page OG images. A colocated opengraph-image.tsx is rejected by
// Next inside the [[...slug]] optional catch-all ("Optional catch-all must
// be the last part of the URL"), so this is the Fumadocs-documented route-
// handler pattern instead: /docs-og/<slugs>/image.png, referenced from the
// docs page's generateMetadata. A route handler is collision-scanned but
// never emitted by `paramour generate` — the registry is unchanged, and a
// route object for an image endpoint would be exactly the artificial
// dogfooding DS6 says not to force.
export function generateStaticParams() {
  return source
    .generateParams()
    .map((page) => ({ slug: [...page.slug, "image.png"] }));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return new ImageResponse(
    <OgCard description={page.data.description} title={page.data.title} />,
    { height: 630, width: 1200 },
  );
}
