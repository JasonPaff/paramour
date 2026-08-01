import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";

// Statically rendered at build time — `next build` bakes the file, so CI
// verifies the route (and the processed-markdown pipeline) on every build.
export const dynamic = "force-static";

// Every docs page as processed markdown (MDX components compiled away; see
// source.config.ts's includeProcessedMarkdown), concatenated for agents that
// want the whole corpus in one fetch. /llms.txt is the per-page index.
export async function GET(): Promise<Response> {
  const sections = await Promise.all(
    source.getPages().map(async (page) => {
      const text = await page.data.getText("processed");
      const url = new URL(page.url, SITE_URL).toString();
      return `# ${page.data.title}\nURL: ${url}\n\n${text}`;
    }),
  );
  return new Response(sections.join("\n\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
