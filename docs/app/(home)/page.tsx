import type { Metadata } from "next";

import { Card, Cards } from "fumadocs-ui/components/card";
import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "@/app/docs/[[...slug]]/route.def";
import { explorerRoute } from "@/app/explorer/route.def";
import { TwoslashCode } from "@/components/twoslash-code";

export const metadata: Metadata = {
  title: {
    absolute: "paramour — type-safe routing for the Next.js App Router",
  },
};

// The hero tells the whole story in one block: define a route, build a typed
// href (the `^?` query renders the inferred type inline), and show the
// library's selling point — what fails to compile. The declared `@errors`
// code is validated by twoslash, so this sample cannot drift (DS8/DS14).
const heroSample = `// @errors: 2769
import { defineAppRoute, href, p } from "paramour";

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { q: p.string().optional() },
});

// typed, validated, explicit: "/product/42?q=paramour"
const link = href(productRoute, { params: { id: 42 }, search: { q: "paramour" } });
//    ^?

// a string into p.integer() fails to compile:
href(productRoute, { params: { id: "42" } });`;

const FEATURES = [
  {
    description:
      "Validate with zod, valibot, arktype — any Standard Schema library. Paramour owns the wire format; your validator owns the rules.",
    slug: ["concepts", "standard-schema"],
    title: "Bring your own validator",
  },
  {
    description:
      "Every codec serializes and parses by a published, numbered spec. URLs are predictable enough to hold us to them.",
    slug: ["reference", "wire-format"],
    title: "Explicit wire format",
  },
  {
    description:
      "Routes are imported objects, not string registries. Unused routes tree-shake away; the compiler sees every reference.",
    slug: ["concepts", "route-objects"],
    title: "Route objects as currency",
  },
  {
    description:
      "generate, check, init, list, doctor — a registry codegen and drift guard that runs in CI (and builds this site).",
    slug: ["guides", "cli"],
    title: "CLI workflows",
  },
  {
    description:
      "A TanStack Devtools panel showing wire vs parsed values, codec shapes, and decode issues live as you navigate.",
    slug: ["reference", "devtools"],
    title: "Devtools panel",
  },
  {
    description:
      "Derive nuqs parsers from a route's search codecs — one definition for links, hooks, and client URL state.",
    slug: ["guides", "nuqs"],
    title: "nuqs adapter",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-col items-center gap-8 px-4 pt-16 pb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">paramour</h1>
        <p className="max-w-xl text-lg text-fd-muted-foreground">
          Type-safe routing companion for the Next.js App Router — validated
          route and search params, typed path building, and an explicit URL wire
          format.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
            href={href(docsRoute, { params: { slug: ["getting-started"] } })}
          >
            Get started
          </Link>
          <Link
            className="rounded-lg border border-fd-border px-5 py-2.5 font-medium transition-colors hover:bg-fd-accent"
            href={href(docsRoute, { params: { slug: ["migrate"] } })}
          >
            Migrate from next-typesafe-url
          </Link>
        </div>
        <div className="w-full max-w-3xl text-left">
          <TwoslashCode code={heroSample} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-16">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          Why paramour
        </h2>
        <p className="mb-6 text-center text-fd-muted-foreground">
          Small pieces that agree with each other — and with your compiler.
        </p>
        <Cards>
          {FEATURES.map((feature) => (
            <Card
              description={feature.description}
              href={href(docsRoute, { params: { slug: feature.slug } })}
              key={feature.title}
              title={feature.title}
            />
          ))}
        </Cards>
      </section>

      <section className="border-y border-fd-border bg-fd-secondary/50 px-4 py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Coming from next-typesafe-url?
          </h2>
          <p className="max-w-xl text-fd-muted-foreground">
            The architecture barely moves — what changes is the vocabulary. Your
            route definitions stay colocated, your hooks keep their names, and{" "}
            <code className="rounded-sm bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
              $path(&#123; route, ... &#125;)
            </code>{" "}
            becomes{" "}
            <code className="rounded-sm bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
              href(route, ...)
            </code>
            . The migration guide was written by migrating a real app, route by
            route.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
              href={href(docsRoute, { params: { slug: ["migrate"] } })}
            >
              Migration guide
            </Link>
            <Link
              className="rounded-lg border border-fd-border px-5 py-2.5 font-medium transition-colors hover:bg-fd-accent"
              href={href(docsRoute, {
                params: { slug: ["migrate", "concept-map"] },
              })}
            >
              Concept map
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-center gap-6 px-4 py-10 text-sm text-fd-muted-foreground">
        <Link
          className="transition-colors hover:text-fd-foreground"
          href={href(explorerRoute)}
        >
          Wire-format explorer
        </Link>
        <a
          className="transition-colors hover:text-fd-foreground"
          href="https://github.com/JasonPaff/paramour"
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
        <a
          className="transition-colors hover:text-fd-foreground"
          href="https://www.npmjs.com/package/paramour"
          rel="noreferrer"
          target="_blank"
        >
          npm
        </a>
      </section>
    </main>
  );
}
