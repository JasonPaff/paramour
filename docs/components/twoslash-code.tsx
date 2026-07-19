import { highlight } from "fumadocs-core/highlight";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs";
import * as Twoslash from "fumadocs-twoslash/ui";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { JsxEmit } from "typescript";

/**
 * A Twoslash-rendered code block outside MDX (DS8 on a non-MDX page): the
 * standalone `highlight()` pipeline with the same transformer configuration
 * as source.config.ts, so React pages like the landing hero get real hover
 * types and validated `// @errors:` squiggles. The snippet compiles against
 * the workspace packages at build time — drift fails `next build`.
 */
export async function TwoslashCode({
  code,
  lang = "ts",
}: {
  code: string;
  lang?: "ts" | "tsx";
}) {
  const rendered = await highlight(code, {
    components: {
      ...Twoslash,
      pre: (props) => <Pre {...props} />,
    },
    // Emit --shiki-light/--shiki-dark variables instead of a baked-in color,
    // matching the MDX pipeline: the Fumadocs preset CSS does the theme
    // switching, and popup code stays readable in both themes.
    defaultColor: false,
    lang,
    // transformerTwoslash sets explicitTrigger; the raw meta string is how a
    // non-MDX call site opts a block in.
    meta: { __raw: "twoslash" },
    themes: { dark: "github-dark", light: "github-light" },
    transformers: [
      ...(rehypeCodeDefaultOptions.transformers ?? []),
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: { jsx: JsxEmit.ReactJSX, types: ["node"] },
        },
        typesCache: createFileSystemTypesCache(),
      }),
    ],
  });

  return <CodeBlock className="text-left">{rendered}</CodeBlock>;
}
