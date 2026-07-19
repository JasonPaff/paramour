import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { href } from "paramour";

import { explorerRoute } from "@/app/explorer/route.def";

export function baseOptions(): BaseLayoutProps {
  return {
    githubUrl: "https://github.com/JasonPaff/paramour",
    links: [{ text: "Explorer", url: href(explorerRoute) }],
    nav: { title: "paramour" },
  };
}
