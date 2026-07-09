"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { href } from "paramour";

import { docsRoute } from "./docs/[[...slug]]/route.def";
import { productRoute } from "./product/[id]/route.def";
import { homeRoute } from "./route.def";

// Every link is built with href(): typed params/search in, a plain string
// out — Href is a string subtype, so it feeds next/link directly.
//
// `path`/`exact` drive only the active-tab highlight. href() output is the real
// destination, and it never has to be re-parsed to know where it points.
const links = [
  { exact: true, label: "Home", path: "/", to: href(homeRoute) },
  {
    exact: false,
    label: "Product #42",
    path: "/product",
    to: href(productRoute, { params: { id: 42 }, search: { q: "paramour" } }),
  },
  { exact: true, label: "Docs", path: "/docs", to: href(docsRoute) },
  {
    exact: true,
    label: "Getting started",
    path: "/docs/getting-started",
    to: href(docsRoute, { params: { slug: ["getting-started"] } }),
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="tabs">
      {links.map(({ exact, label, path, to }) => {
        const active = exact ? pathname === path : pathname.startsWith(path);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            href={to}
            key={label}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
