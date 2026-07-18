import { rehypeCodeDefaultOptions, remarkNpm } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs";
import { JsxEmit } from "typescript";

export const docs = defineDocs({ dir: "content/docs" });

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      // Shiki can't lazy-load languages inside Twoslash popups; preload the
      // set the docs actually use.
      langs: ["bash", "js", "json", "jsx", "ts", "tsx"],
      themes: {
        dark: "github-dark",
        light: "github-light",
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          // tsx twoslash snippets (hooks, devtools, nuqs guides) contain JSX.
          twoslashOptions: {
            compilerOptions: { jsx: JsxEmit.ReactJSX },
          },
          typesCache: createFileSystemTypesCache(),
        }),
      ],
    },
    // ```package-install``` blocks render as npm/pnpm/yarn/bun tabs; the
    // persist id keeps the reader's package-manager choice across pages.
    remarkPlugins: [[remarkNpm, { persist: { id: "package-manager" } }]],
  },
});
