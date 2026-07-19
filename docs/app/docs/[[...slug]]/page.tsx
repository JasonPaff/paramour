import type { RouteProps } from "paramour";

import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";

import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

import { docsRoute } from "./route.def";

export async function generateMetadata(props: RouteProps) {
  const result = await docsRoute.safeParseParams(props);
  if (result.status === "error") notFound();

  const page = source.getPage(result.data.slug);
  if (!page) notFound();

  // Twitter card metadata falls back to openGraph, so images are set once.
  return {
    description: page.data.description,
    openGraph: {
      images: [`/docs-og/${[...page.slugs, "image.png"].join("/")}`],
    },
    title: page.data.title,
  };
}

export function generateStaticParams() {
  return source.generateParams();
}

export default async function Page(props: RouteProps) {
  // Dogfood: the paramour route object decodes Next's promised props; a
  // malformed URL becomes a 404 instead of reaching the error boundary.
  // Params-only parse — awaiting searchParams would opt out of static
  // rendering, and this route has no search config.
  const result = await docsRoute.safeParseParams(props);
  if (result.status === "error") notFound();

  const page = source.getPage(result.data.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage full={page.data.full} toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
