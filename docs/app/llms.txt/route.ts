import { llms } from "fumadocs-core/source/llms";

import { source } from "@/lib/source";

// Statically rendered at build time — `next build` bakes the file, so CI
// verifies the route on every build.
export const dynamic = "force-static";

const { index } = llms(source);

// An index of every docs page for agents doing web lookups without the
// bundled skill installed; /llms-full.txt carries the full content.
export function GET(): Response {
  return new Response(index(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
