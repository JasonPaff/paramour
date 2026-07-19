import type { MetadataRoute } from "next";

import { href } from "paramour";

import { homeRoute } from "@/app/(home)/route.def";
import { docsRoute } from "@/app/docs/[[...slug]]/route.def";
import { explorerRoute } from "@/app/explorer/route.def";
import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";

// Dogfooded (DS6): every URL is built by href() from the same route objects
// the pages link with, so the sitemap cannot cite a path the registry lacks.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL(href(homeRoute), SITE_URL).toString() },
    { url: new URL(href(explorerRoute), SITE_URL).toString() },
    ...source.getPages().map((page) => ({
      url: new URL(
        href(docsRoute, { params: { slug: page.slugs } }),
        SITE_URL,
      ).toString(),
    })),
  ];
}
