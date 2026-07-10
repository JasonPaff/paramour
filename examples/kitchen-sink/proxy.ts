import { type NextRequest, NextResponse } from "next/server";
import { buildSearchString, encodeSearch, safeDecodeSearch } from "paramour";

import {
  productsListRoute,
  productsListSearch,
} from "./app/products/route.def";

// Canonicalization in the routing layer: decode the incoming query, re-encode
// it, and 308 when the bytes differ. Explicit serialization means every
// decoded state has exactly ONE wire form — ?page=1&sort=name collapses to
// bare /products (D8 elision), and a hand-typed ?q=usb+c becomes ?q=usb%20c
// (S2: spaces are %20, never +). The filter page always emits canonical URLs
// itself (it builds them with href()), so this only ever fires on inbound
// links and hand-edited URLs — never in the client-nav hot path.
const declaredKeys = new Set(Object.keys(productsListSearch));

export function proxy(request: NextRequest) {
  const { nextUrl } = request;

  // The sync safe helper — a proxy holds a live URLSearchParams (a
  // SearchSource as-is), not the props promises pages await. Malformed input
  // is the PAGE's problem: its error arm renders a reset link, so the proxy
  // passes junk through rather than guessing or 500ing.
  const decoded = safeDecodeSearch(productsListRoute, nextUrl.searchParams);
  if (decoded.status === "error") return NextResponse.next();

  // Canonical pairs for the keys this route OWNS; everything else (utm_*,
  // Next's own _rsc, ...) passes through in arrival order. Decode ignores
  // undeclared keys (P8), so canonicalization must not eat them either.
  // decoded.data flows straight into encodeSearch — explicit undefined on an
  // omittable key is a second spelling of absence (S3).
  const pairs = [
    ...encodeSearch(productsListSearch, decoded.data),
    ...[...nextUrl.searchParams].filter(([key]) => !declaredKeys.has(key)),
  ];
  const canonical = nextUrl.pathname + buildSearchString(pairs);
  if (nextUrl.pathname + nextUrl.search === canonical) {
    return NextResponse.next();
  }

  // Loop-safe by construction: decode→encode is idempotent (the wire spec's
  // round-trip guarantee), so the canonical URL re-canonicalizes to itself.
  // 308 = permanent, same status the /search legacy redirects use.
  return NextResponse.redirect(new URL(canonical, request.url), 308);
}

export const config = {
  // Exact-match the list page only: /products/[id] has no search config
  // worth canonicalizing, and scoping tightly keeps the proxy out of every
  // other route's request path.
  matcher: ["/products"],
};
