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
    // Surface 2: router methods
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
    // Surface 3: redirect / permanentRedirect
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
    // Surface 3, namespace form
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
    // ignorePaths boundary: "/legacy" does not exempt "/legacybar"
    {
      code: `import Link from "next/link";
export const el = <Link href="/legacybar" />;`,
      errors: [{ data: { path: "/legacybar" }, messageId: "rawHref" }],
      options: [{ ignorePaths: ["/legacy"] }],
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
    // Non-"/" hrefs are exempt (LP5)
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
    // Pages router is a deferred surface — must not fire
    `import { useRouter } from "next/router";
export function go() {
  const router = useRouter();
  router.push("/a");
}`,
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
    // Intrinsic elements never resolve to a Link import
    `export const el = <a href="/x" />;`,
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
  ],
});
