import type { Metadata } from "next";

import { Card, Cards } from "fumadocs-ui/components/card";
import Link from "next/link";
import { href } from "paramour";

import { docsRoute } from "@/app/docs/[[...slug]]/route.def";
import { explorerRoute } from "@/app/explorer/route.def";
import { TwoslashCode } from "@/components/twoslash-code";
import { UrlAssembly } from "@/components/url-assembly";

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

// Both before/after samples compile — that asymmetry is the point (the
// caption under them says so). Twoslash keeps the "after" side honest.
const beforeSample = `declare const product: { id: number };
declare const searchParams: Record<string, string | undefined>;

// nothing is watching a template literal — the typo ships
const link = \`/produtc/\${product.id}?page=2\`;

// every read is a guess
const page = Number(searchParams.page); // NaN when absent`;

const afterSample = `import { defineAppRoute, href, p } from "paramour";

export const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { page: p.integer().default(1) },
});

// the path is real, the types are checked, absence has a rule
const link = href(productRoute, {
  params: { id: 42 },
  search: { page: 2 },
});`;

const PROOF: { label: string; slug?: string[] }[] = [
  {
    label: "Standard Schema: zod, valibot, arktype",
    slug: ["concepts", "standard-schema"],
  },
  { label: "Zero runtime dependencies" },
  { label: "Published wire-format spec", slug: ["reference", "wire-format"] },
  { label: "ESM-only, tree-shakeable" },
  { label: "MIT" },
];

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

const ECOSYSTEM = [
  {
    blurb:
      "Codecs, route definitions, href, and the reflection API — the core that carries the spec.",
    name: "paramour",
    slug: ["reference", "core"],
  },
  {
    blurb: "withTypedRoutes, App and Pages Router hooks, and the paramour CLI.",
    name: "@paramour-js/next",
    slug: ["reference", "next"],
  },
  {
    blurb:
      "TanStack Devtools panel: wire vs parsed values and decode issues, live.",
    name: "@paramour-js/devtools",
    slug: ["reference", "devtools"],
  },
  {
    blurb: "nuqs parsers derived from a route's search codecs.",
    name: "@paramour-js/nuqs",
    slug: ["reference", "nuqs"],
  },
  {
    blurb: "no-raw-hrefs — every link goes through href().",
    name: "@paramour-js/eslint-plugin",
    slug: ["reference", "eslint-plugin"],
  },
];

const COMPARISON = [
  { feature: "Typed path building", ntu: "✓", paramour: "✓", typedRoutes: "✓" },
  {
    feature: "Route params validated at runtime",
    ntu: "✓",
    paramour: "✓",
    typedRoutes: "—",
  },
  {
    feature: "Search params validated at runtime",
    ntu: "✓",
    paramour: "✓",
    typedRoutes: "—",
  },
  {
    feature: "Validator",
    ntu: "zod",
    paramour: "any Standard Schema",
    typedRoutes: "—",
  },
  {
    feature: "Library-owned serialization with a published spec",
    ntu: "—",
    paramour: "✓",
    typedRoutes: "—",
  },
  {
    feature: "Hooks for reading params",
    ntu: "✓",
    paramour: "✓",
    typedRoutes: "—",
  },
  {
    feature: "CI drift check (check, doctor)",
    ntu: "—",
    paramour: "✓",
    typedRoutes: "—",
  },
  { feature: "Devtools panel", ntu: "—", paramour: "✓", typedRoutes: "—" },
  { feature: "nuqs adapter", ntu: "—", paramour: "✓", typedRoutes: "—" },
  {
    feature: "ESLint rule for raw hrefs",
    ntu: "—",
    paramour: "✓",
    typedRoutes: "—",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-col items-center gap-6 px-4 pt-16 pb-10 text-center">
        <h1 className="text-5xl font-bold tracking-tight">paramour</h1>
        <p className="text-xl font-medium">
          A routing companion your compiler approves of.
        </p>
        <p className="max-w-xl text-fd-muted-foreground">
          Validated route and search params, typed path building, and an
          explicit URL wire format for the Next.js App Router — with the
          Standard Schema validator you already use.
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
            href="#compare"
          >
            How it compares
          </Link>
        </div>
        <div className="w-full max-w-3xl text-left">
          <TwoslashCode
            code={heroSample}
            title="app/product/[id]/route.def.ts"
          />
        </div>
        <UrlAssembly />
        <ul className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-fd-muted-foreground">
          {PROOF.map((item) => (
            <li key={item.label}>
              {item.slug ? (
                <Link
                  className="inline-block rounded-full border border-fd-border px-3 py-1 transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  href={href(docsRoute, { params: { slug: item.slug } })}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="inline-block rounded-full border border-fd-border px-3 py-1">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          The URL is an API. Most apps type it by hand.
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-center text-fd-muted-foreground">
          Template literals compile no matter what they say, and everything read
          back from a URL is a string until proven otherwise.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <TwoslashCode code={beforeSample} title="By hand" />
          <TwoslashCode code={afterSample} title="With paramour" />
        </div>
        <p className="mt-6 text-center text-sm text-fd-muted-foreground">
          Both of these compile. Only one of them is checked.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-14">
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
        <div className="mx-auto w-full max-w-5xl">
          <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
            One route definition, the whole toolchain
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-fd-muted-foreground">
            Everything downstream — hooks, codegen, devtools, nuqs parsers, lint
            rules — reads the same route object.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ECOSYSTEM.map((pkg) => (
              <Link
                className="rounded-lg border border-fd-border bg-fd-card p-4 text-left transition-colors hover:bg-fd-accent"
                href={href(docsRoute, { params: { slug: pkg.slug } })}
                key={pkg.name}
              >
                <div className="mb-1 font-mono text-sm font-medium">
                  {pkg.name}
                </div>
                <p className="text-sm text-fd-muted-foreground">{pkg.blurb}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14" id="compare">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          How it compares
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-center text-fd-muted-foreground">
          Against next-typesafe-url and Next.js&apos;s built-in typedRoutes.
        </p>
        <div className="overflow-x-auto rounded-xl border border-fd-border">
          <table className="w-full min-w-160 border-collapse text-sm">
            <thead>
              <tr className="border-b border-fd-border bg-fd-secondary/50 text-left">
                <th className="px-4 py-3 font-medium" scope="col">
                  <span className="sr-only">Feature</span>
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  paramour
                </th>
                <th
                  className="px-4 py-3 font-medium text-fd-muted-foreground"
                  scope="col"
                >
                  next-typesafe-url
                </th>
                <th
                  className="px-4 py-3 font-medium text-fd-muted-foreground"
                  scope="col"
                >
                  typedRoutes
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr
                  className="border-b border-fd-border last:border-b-0"
                  key={row.feature}
                >
                  <td className="px-4 py-3 text-fd-muted-foreground">
                    {row.feature}
                  </td>
                  <ComparisonCell value={row.paramour} />
                  <ComparisonCell value={row.ntu} />
                  <ComparisonCell value={row.typedRoutes} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-center text-xs text-fd-muted-foreground">
          As of next-typesafe-url 5.x and the typedRoutes option in Next.js 16.
          Spotted something out of date? Open an issue.
        </p>
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

      <section className="flex flex-col items-center gap-5 px-4 py-14 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Start with one route
        </h2>
        <code className="rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 font-mono text-sm">
          pnpm add paramour @paramour-js/next
        </code>
        <Link
          className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          href={href(docsRoute, { params: { slug: ["getting-started"] } })}
        >
          Get started
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-sm text-fd-muted-foreground">
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
        </div>
      </section>
    </main>
  );
}

function ComparisonCell({ value }: { value: string }) {
  if (value === "✓") {
    return <td className="px-4 py-3 text-fd-primary">✓</td>;
  }
  if (value === "—") {
    return <td className="px-4 py-3 text-fd-muted-foreground/50">—</td>;
  }
  return <td className="px-4 py-3">{value}</td>;
}
