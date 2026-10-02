import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import { noRawHrefs } from "../src/rules/no-raw-hrefs.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-raw-hrefs", noRawHrefs, {
  invalid: [
    // Surface 1: Link href
    {
      code: `import Link from "next/link";
export const el = <Link href="/users/123" />;`,
      errors: [{ data: { path: "/users/123" }, messageId: "rawHref" }],
    },
    {
      code: `import L from "next/link";
export const el = <L href="/x" />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
    },
    {
      code: `import { default as L } from "next/link";
export const el = <L href="/x" />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href={"/x"} />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href={\`/x\`} />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
    },
    // Surface 1: extensionful nodenext spelling counts too
    {
      code: `import Link from "next/link.js";
export const el = <Link href="/x" />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
    },
    // Surface 1, UrlObject form
    {
      code: `import Link from "next/link";
export const el = <Link href={{ pathname: "/users/123" }} />;`,
      errors: [{ data: { path: "/users/123" }, messageId: "rawUrlObject" }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href={{ hash: "top", pathname: "/x", query: { page: 2 } }} />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href={{ "pathname": "/x" }} />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href={{ pathname: \`/x\` }} />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
    },
    // Surface 2: router methods (App Router)
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const router = useRouter();
  router.push("/shop?page=2");
}`,
      errors: [
        {
          data: { method: "push", path: "/shop?page=2" },
          messageId: "rawRouterCall",
        },
      ],
    },
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const router = useRouter();
  router.replace("/a");
}`,
      errors: [
        { data: { method: "replace", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const router = useRouter();
  router.prefetch("/a");
}`,
      errors: [
        {
          data: { method: "prefetch", path: "/a" },
          messageId: "rawRouterCall",
        },
      ],
    },
    {
      code: `import { useRouter as useNav } from "next/navigation";
export function go() {
  const r = useNav();
  r.push("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    // Surface 2, destructured form
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const { push } = useRouter();
  push("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const { push: navigate } = useRouter();
  navigate("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    // Surface 2: router methods (Pages Router) — same forms, same message
    {
      code: `import { useRouter } from "next/router";
export function go() {
  const router = useRouter();
  router.push("/a");
}`,
      errors: [
        { data: { method: "push", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import { useRouter } from "next/router";
export function go() {
  const router = useRouter();
  router.replace("/a");
}`,
      errors: [
        { data: { method: "replace", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import { useRouter } from "next/router";
export function go() {
  const router = useRouter();
  router.prefetch("/a");
}`,
      errors: [
        {
          data: { method: "prefetch", path: "/a" },
          messageId: "rawRouterCall",
        },
      ],
    },
    {
      code: `import { useRouter } from "next/router";
export function go() {
  const { push: navigate } = useRouter();
  navigate("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import { useRouter as usePagesRouter } from "next/router";
export function go() {
  const r = usePagesRouter();
  r.push("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import * as pages from "next/router";
export function go() {
  const router = pages.useRouter();
  router.push("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import { useRouter } from "next/router.js";
export function go() {
  const router = useRouter();
  router.push("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    // Surface 2, UrlObject argument — both routers, all forms
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const router = useRouter();
  router.push({ pathname: "/x" });
}`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
    },
    {
      code: `import { useRouter } from "next/router";
export function go() {
  const router = useRouter();
  router.push({ pathname: "/x", query: { page: 2 } });
}`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
    },
    {
      code: `import { useRouter } from "next/navigation";
export function go() {
  const { push } = useRouter();
  push({ pathname: "/x" });
}`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
    },
    // Surface 3: static Router from next/router
    {
      code: `import Router from "next/router";
Router.push("/a");`,
      errors: [
        { data: { method: "push", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import Router from "next/router";
Router.replace("/a");`,
      errors: [
        { data: { method: "replace", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import Router from "next/router";
Router.prefetch("/a");`,
      errors: [
        {
          data: { method: "prefetch", path: "/a" },
          messageId: "rawRouterCall",
        },
      ],
    },
    {
      code: `import R from "next/router";
R.push("/a");`,
      errors: [
        { data: { method: "push", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import Router from "next/router.js";
Router.push("/a");`,
      errors: [
        { data: { method: "push", path: "/a" }, messageId: "rawRouterCall" },
      ],
    },
    {
      code: `import Router from "next/router";
Router.push({ pathname: "/a" });`,
      errors: [{ data: { path: "/a" }, messageId: "rawUrlObject" }],
    },
    // Surface 4: redirect / permanentRedirect
    {
      code: `import { redirect } from "next/navigation";
redirect("/login");`,
      errors: [
        {
          data: { callee: "redirect", path: "/login" },
          messageId: "rawRedirect",
        },
      ],
    },
    {
      code: `import { permanentRedirect } from "next/navigation";
permanentRedirect("/old");`,
      errors: [
        {
          data: { callee: "permanentRedirect", path: "/old" },
          messageId: "rawRedirect",
        },
      ],
    },
    {
      code: `import { redirect as boot } from "next/navigation";
boot("/login");`,
      errors: [
        {
          data: { callee: "redirect", path: "/login" },
          messageId: "rawRedirect",
        },
      ],
    },
    {
      code: `import { redirect } from "next/navigation";
redirect(\`/login\`);`,
      errors: [
        {
          data: { callee: "redirect", path: "/login" },
          messageId: "rawRedirect",
        },
      ],
    },
    {
      code: `import { redirect } from "next/navigation.js";
redirect("/login");`,
      errors: [
        {
          data: { callee: "redirect", path: "/login" },
          messageId: "rawRedirect",
        },
      ],
    },
    // Surface 4, namespace form
    {
      code: `import * as nav from "next/navigation";
nav.redirect("/login");`,
      errors: [
        {
          data: { callee: "redirect", path: "/login" },
          messageId: "rawRedirect",
        },
      ],
    },
    // Surface 2 via a namespace-qualified useRouter()
    {
      code: `import * as nav from "next/navigation";
export function go() {
  const router = nav.useRouter();
  router.push("/x");
}`,
      errors: [
        { data: { method: "push", path: "/x" }, messageId: "rawRouterCall" },
      ],
    },
    // Surface 5: Form action from next/form
    {
      code: `import Form from "next/form";
export const el = <Form action="/search" />;`,
      errors: [{ data: { path: "/search" }, messageId: "rawFormAction" }],
    },
    {
      code: `import F from "next/form";
export const el = <F action="/search" />;`,
      errors: [{ data: { path: "/search" }, messageId: "rawFormAction" }],
    },
    {
      code: `import Form from "next/form";
export const el = <Form action={\`/search\`} />;`,
      errors: [{ data: { path: "/search" }, messageId: "rawFormAction" }],
    },
    // Surface 6: NextResponse.redirect / rewrite from next/server
    {
      code: `import { NextResponse } from "next/server";
NextResponse.redirect("/login");`,
      errors: [
        {
          data: { method: "redirect", path: "/login" },
          messageId: "rawNextResponse",
        },
      ],
    },
    {
      code: `import { NextResponse } from "next/server";
NextResponse.rewrite("/maintenance");`,
      errors: [
        {
          data: { method: "rewrite", path: "/maintenance" },
          messageId: "rawNextResponse",
        },
      ],
    },
    // Surface 6, inline-URL form — reported on the inner path literal
    {
      code: `import { NextResponse } from "next/server";
declare const req: { url: string };
NextResponse.redirect(new URL("/login", req.url));`,
      errors: [
        {
          column: 31,
          data: { method: "redirect", path: "/login" },
          line: 3,
          messageId: "rawNextResponse",
        },
      ],
    },
    {
      code: `import { NextResponse } from "next/server";
declare const req: { url: string };
NextResponse.rewrite(new URL(\`/maintenance\`, req.url));`,
      errors: [
        {
          data: { method: "rewrite", path: "/maintenance" },
          messageId: "rawNextResponse",
        },
      ],
    },
    {
      code: `import { NextResponse as NR } from "next/server";
NR.redirect("/login");`,
      errors: [
        {
          data: { method: "redirect", path: "/login" },
          messageId: "rawNextResponse",
        },
      ],
    },
    {
      code: `import { NextResponse } from "next/server.js";
NextResponse.redirect("/login");`,
      errors: [
        {
          data: { method: "redirect", path: "/login" },
          messageId: "rawNextResponse",
        },
      ],
    },
    // linkComponents: wrapper components resolve by imported name + source
    {
      code: `import { AppLink as A } from "@acme/ui";
export const el = <A href="/x" />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
      options: [{ linkComponents: [{ name: "AppLink", source: "@acme/ui" }] }],
    },
    {
      code: `import MyLink from "@acme/ui/link";
export const el = <MyLink href="/x" />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
      options: [
        { linkComponents: [{ name: "default", source: "@acme/ui/link" }] },
      ],
    },
    {
      code: `import { Anchor } from "@acme/ui";
export const el = <Anchor to="/x" />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawHref" }],
      options: [
        {
          linkComponents: [{ name: "Anchor", prop: "to", source: "@acme/ui" }],
        },
      ],
    },
    {
      code: `import { AppLink } from "@acme/ui";
export const el = <AppLink href={{ pathname: "/x" }} />;`,
      errors: [{ data: { path: "/x" }, messageId: "rawUrlObject" }],
      options: [{ linkComponents: [{ name: "AppLink", source: "@acme/ui" }] }],
    },
    {
      code: `import { AppLink } from "@acme/ui";
export const el = <AppLink href="/legacybar" />;`,
      errors: [{ data: { path: "/legacybar" }, messageId: "rawHref" }],
      options: [
        {
          ignorePaths: ["/legacy"],
          linkComponents: [{ name: "AppLink", source: "@acme/ui" }],
        },
      ],
    },
    // ignorePaths boundary: "/legacy" does not exempt "/legacybar"
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacybar" />;`,
      errors: [{ data: { path: "/legacybar" }, messageId: "rawHref" }],
      options: [{ ignorePaths: ["/legacy"] }],
    },
    {
      code: `import { NextResponse } from "next/server";
NextResponse.redirect("/legacybar");`,
      errors: [
        {
          data: { method: "redirect", path: "/legacybar" },
          messageId: "rawNextResponse",
        },
      ],
      options: [{ ignorePaths: ["/legacy"] }],
    },
    // The built-in /api exemption is segment-bounded too
    {
      code: `import Link from "next/link";
export const el = <Link href="/apiary" />;`,
      errors: [{ data: { path: "/apiary" }, messageId: "rawHref" }],
    },
    {
      code: `import { redirect } from "next/navigation";
redirect("/apis/v2");`,
      errors: [
        {
          data: { callee: "redirect", path: "/apis/v2" },
          messageId: "rawRedirect",
        },
      ],
    },
    // Multiple violations in one file, with report locations
    {
      code: `import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
export function C() {
  const router = useRouter();
  router.push("/one");
  redirect("/two");
  return <Link href="/three" />;
}`,
      errors: [
        {
          column: 15,
          data: { method: "push", path: "/one" },
          line: 5,
          messageId: "rawRouterCall",
        },
        {
          column: 12,
          data: { callee: "redirect", path: "/two" },
          line: 6,
          messageId: "rawRedirect",
        },
        {
          column: 21,
          data: { path: "/three" },
          line: 7,
          messageId: "rawHref",
        },
      ],
    },
  ],
  valid: [
    // Non-"/" hrefs are exempt
    `import Link from "next/link";
export const el = <Link href="https://example.com/about" />;`,
    `import Link from "next/link";
export const el = <Link href="#section" />;`,
    `import Link from "next/link";
export const el = <Link href="mailto:a@b.co" />;`,
    `import Link from "next/link";
export const el = <Link href="tel:+15551234567" />;`,
    `import Link from "next/link";
export const el = <Link href="settings" />;`,
    `import Link from "next/link";
export const el = <Link href="" />;`,
    `import Link from "next/link";
export const el = <Link href="//cdn.example.com/asset" />;`,
    // Link from another module — never fires, regardless of the name
    `import Link from "@/components/link";
export const el = <Link href="/users/1" />;`,
    // href()-built and other dynamic values
    `import Link from "next/link";
declare const route: { href: (p: { id: number }) => string };
export const el = <Link href={route.href({ id: 5 })} />;`,
    `import Link from "next/link";
declare const id: string;
export const el = <Link href={\`/users/\${id}\`} />;`,
    // Type-only import — a value usage is already a TS error
    `import type Link from "next/link";
export const el = <Link href="/x" />;`,
    // UrlObject: computed keys, dynamic values, and absent pathname are all
    // out of scope
    `import Link from "next/link";
export const el = <Link href={{ ["pathname"]: "/x" }} />;`,
    `import Link from "next/link";
declare const path: string;
export const el = <Link href={{ pathname: path }} />;`,
    `import Link from "next/link";
export const el = <Link href={{ query: { page: 2 } }} />;`,
    `import Link from "next/link";
declare const parts: { pathname: string };
export const el = <Link href={{ ...parts }} />;`,
    `import Link from "next/link";
export const el = <Link href={{ pathname: "https://example.com/x" }} />;`,
    // Pages useRouter from another module
    `import { useRouter } from "@/lib/router";
export function go() {
  const router = useRouter();
  router.push("/a");
}`,
    // Type-only Pages import
    `import type { useRouter } from "next/router";
declare const r: ReturnType<typeof useRouter>;`,
    // Static Router: other module, shadowed local, named import
    `import Router from "@/lib/router";
Router.push("/a");`,
    `import Router from "next/router";
export function go() {
  const Router = { push: (p: string) => p };
  Router.push("/a");
}`,
    `import { Router } from "next/router";
Router.push("/a");`,
    // Router-shaped calls on non-router variables
    `declare function getRouter(): { push: (p: string) => void };
export function go() {
  const router = getRouter();
  router.push("/a");
}`,
    `export function go() {
  const items: string[] = [];
  items.push("/a");
}`,
    // Dynamic argument — out of scope for v1
    `import { useRouter } from "next/navigation";
export function go(id: string) {
  const router = useRouter();
  router.push("/users/" + id);
}`,
    // Shadowed import resolves to the inner binding
    `import { redirect } from "next/navigation";
export function f() {
  const redirect = (p: string) => p;
  redirect("/x");
}`,
    // redirect from another module
    `import { redirect } from "./auth";
redirect("/x");`,
    // Namespace import of another module
    `import * as nav from "./auth";
nav.redirect("/x");`,
    // Intrinsic elements never resolve to a Link or Form import
    `export const el = <a href="/x" />;`,
    `export const el = <form action="/x" />;`,
    // Form action: function values (server actions), non-internal paths,
    // other modules, type-only imports
    `import Form from "next/form";
declare function search(formData: FormData): Promise<void>;
export const el = <Form action={search} />;`,
    `import Form from "next/form";
export const el = <Form action="https://example.com/search" />;`,
    `import Form from "@/components/form";
export const el = <Form action="/search" />;`,
    `import type Form from "next/form";
export const el = <Form action="/search" />;`,
    // NextResponse: absolute URLs and URL values are what the API requires
    `import { NextResponse } from "next/server";
NextResponse.redirect("https://example.com/login");`,
    `import { NextResponse } from "next/server";
declare const req: { url: string };
NextResponse.redirect(new URL(req.url));`,
    `import { NextResponse } from "next/server";
declare const url: URL;
NextResponse.redirect(url);`,
    `import { NextResponse } from "@/lib/server";
NextResponse.redirect("/login");`,
    // A shadowed URL binding is not the global constructor
    `import { NextResponse } from "next/server";
declare const req: { url: string };
export function f() {
  const URL = (p: string, b: string) => p + b;
  NextResponse.redirect(new URL("/login", req.url));
}`,
    // linkComponents: wrong source, type-only, no option configured
    {
      code: `import { AppLink } from "@other/ui";
export const el = <AppLink href="/x" />;`,
      options: [{ linkComponents: [{ name: "AppLink", source: "@acme/ui" }] }],
    },
    {
      code: `import type { AppLink } from "@acme/ui";
export const el = <AppLink href="/x" />;`,
      options: [{ linkComponents: [{ name: "AppLink", source: "@acme/ui" }] }],
    },
    `import { AppLink } from "@acme/ui";
export const el = <AppLink href="/x" />;`,
    // linkComponents: a custom prop entry leaves the default href alone
    {
      code: `import { Anchor } from "@acme/ui";
export const el = <Anchor href="/x" />;`,
      options: [
        {
          linkComponents: [{ name: "Anchor", prop: "to", source: "@acme/ui" }],
        },
      ],
    },
    // Route handlers under /api are exempt with no options: href() cannot
    // build them, because the registry lists only pages.
    `import Link from "next/link";
export const el = <Link href="/api/auth/auto-signin" />;`,
    `import Link from "next/link";
export const el = <Link href="/api" />;`,
    `import Link from "next/link";
export const el = <Link href={{ pathname: "/api/export" }} />;`,
    `import { useRouter } from "next/navigation";
export function C() {
  const router = useRouter();
  router.push("/api/auth/sign-out?callbackUrl=%2F");
}`,
    `import { NextResponse } from "next/server";
NextResponse.redirect("/api/auth/signin");`,
    // ...and the exemption stacks with configured ignorePaths
    {
      code: `import Link from "next/link";
export const a = <Link href="/api/x" />;
export const b = <Link href="/legacy/y" />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    // ignorePaths: prefix boundaries
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacy" />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacy/old" />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacy?tab=1" />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacy#top" />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    // Trailing slash on the configured prefix is normalized away
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacy" />;`,
      options: [{ ignorePaths: ["/legacy/"] }],
    },
    {
      code: `import { redirect } from "next/navigation";
redirect("/legacy/login");`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    // ignorePaths applies to a UrlObject pathname identically
    {
      code: `import Link from "next/link";
export const el = <Link href={{ pathname: "/legacy/old" }} />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    // ignorePaths applies at NextResponse and Form surfaces
    {
      code: `import { NextResponse } from "next/server";
NextResponse.redirect("/legacy/login");`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
    {
      code: `import Form from "next/form";
export const el = <Form action="/legacy/search" />;`,
      options: [{ ignorePaths: ["/legacy"] }],
    },
  ],
});
