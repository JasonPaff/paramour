"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { href } from "paramour";

import { legacyRoute } from "../lib/legacy.def";
import { docsRoute } from "./docs/[[...slug]]/route.def";
import { eventsRoute } from "./events/[date]/route.def";
import { filesRoute } from "./files/[...path]/route.def";
import { findRoute } from "./find/route.def";
import { productsListRoute } from "./products/route.def";
import { homeRoute } from "./route.def";
import { serializeRoute } from "./serialize/route.def";

// Every link is built with href(): typed params/search in, a plain string out.
// Href is a string subtype, so it feeds next/link directly. A route whose only
// dynamic segment is an optional catch-all (docs) can be linked with no params,
// and a registered static path can skip the route object entirely — see the
// exotic wing below.
//
// `prefix` is only for the active-tab highlight — href() output is the real
// destination, and the built string never has to be re-parsed to know where it
// points.
const links = [
  { label: "Home", prefix: "/", to: href(homeRoute) },
  {
    label: "Products",
    prefix: "/products",
    // The list route: no params, and every search key is omittable, so
    // href() needs no arguments at all. /search is deliberately NOT here — a
    // tab that instantly redirects away could never render as active.
    to: href(productsListRoute),
  },
  { label: "Docs", prefix: "/docs", to: href(docsRoute) },
  {
    label: "Files",
    prefix: "/files",
    to: href(filesRoute, { params: { path: ["readme.md"] } }),
  },
  {
    label: "Events",
    prefix: "/events",
    // isoDate's href input is a Date (the codec's Out), not a string.
    to: href(eventsRoute, { params: { date: new Date("2026-07-06") } }),
  },
  {
    label: "Find",
    prefix: "/find",
    to: href(findRoute, { search: { q: "cable" } }),
  },
  { label: "Serialize", prefix: "/serialize", to: href(serializeRoute) },
  // The exotic-conventions wing: a route group page, a parallel-routes page,
  // and the two interception hosts. Gallery's prefix also matches
  // /gallery/[photoId], so the tab stays lit under the modal.
  //
  // These four use href's string form (SH1): a registered STATIC path stands
  // in for the route object, so linking needs no route.def import at all. The
  // path is still verified — the union comes from the generated registry, and
  // a typo or a dynamic path (`href("/gallery/[photoId]")`) fails to compile.
  // The form is hash-only: no params, and no search even where the route
  // defines one (about's `ref`) — a query string only comes from a route
  // object's search codecs.
  { label: "About", prefix: "/about", to: href("/about") },
  { label: "Dashboard", prefix: "/dashboard", to: href("/dashboard") },
  { label: "Gallery", prefix: "/gallery", to: href("/gallery") },
  { label: "Feed", prefix: "/feed", to: href("/feed") },
  {
    label: "Legacy",
    prefix: "/legacy",
    // A pages route in an app/ nav (PR1): href() is router-agnostic.
    to: href(legacyRoute, { search: { ref: "nav" } }),
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="tabs">
      {links.map(({ label, prefix, to }) => {
        // In a hybrid app Next types usePathname() as string | null (it can
        // legally render under the Pages Router, where it has no App Router
        // pathname). This nav only ever mounts under app/, so null just
        // means "no active tab".
        const active =
          prefix === "/"
            ? pathname === "/"
            : (pathname?.startsWith(prefix) ?? false);
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
