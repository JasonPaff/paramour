import type { ReactNode } from "react";

/**
 * One numbered wire-format rule (plan-docs-milestone-5 A2): an anchored,
 * permalinked section whose `id` renders as a badge. The lowercased rule ID
 * is the stable anchor (`#s3`), and the literal `<Rule id="…">` spelling in
 * the MDX source is what `wire-spec-publication.test.ts` extracts to
 * cross-check publication against the conformance suite — keep the attribute
 * a plain string literal.
 */
export function Rule({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  const anchor = id.toLowerCase();
  return (
    <section className="scroll-mt-24" id={anchor}>
      <h3 className="flex items-baseline gap-2">
        <a
          className="flex items-baseline gap-2 no-underline"
          href={`#${anchor}`}
        >
          <span className="rounded-md border border-fd-border bg-fd-secondary px-1.5 py-0.5 font-mono text-sm font-semibold text-fd-secondary-foreground">
            {id}
          </span>
          <span>{title}</span>
        </a>
      </h3>
      {children}
    </section>
  );
}
