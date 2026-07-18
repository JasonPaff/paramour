import type { MDXComponents } from "mdx/types";

import * as Twoslash from "fumadocs-twoslash/ui";
import defaultMdxComponents from "fumadocs-ui/mdx";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...Twoslash,
    ...components,
  };
}
