import Link from "next/link";
import { useRouter } from "next/router";
import { href } from "paramour";

import { findRoute, guideRoute, homeRoute, productRoute } from "../lib/routes";

// Every link is built with href(): typed params/search in, a plain string
// out — Href is a string subtype, so it feeds next/link directly. href() is
// router-agnostic (PR3): the same call shape the App Router examples use.
//
// `path`/`exact` drive only the active-tab highlight; href() output is the
// real destination.
const links = [
  { exact: true, label: "Home", path: "/", to: href(homeRoute) },
  {
    exact: false,
    label: "Product #42",
    path: "/products",
    to: href(productRoute, { params: { id: 42 }, search: { q: "paramour" } }),
  },
  {
    exact: true,
    label: "Find",
    path: "/find",
    to: href(findRoute, { search: { q: "cable", tag: ["audio", "usb"] } }),
  },
  {
    exact: false,
    label: "Guides",
    path: "/guides",
    to: href(guideRoute, { params: { topic: "routing" } }),
  },
];

export function Nav() {
  // next/router, not next/navigation — `pathname` is the route PATTERN
  // (/products/[id]), which is exactly what the tab highlight wants.
  const { pathname } = useRouter();

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
