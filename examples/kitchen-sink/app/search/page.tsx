import { permanentRedirect, redirect } from "next/navigation";
import { href, type RouteProps } from "paramour";

import { productsRoute } from "../products/[id]/route.def";
import { productsListRoute } from "../products/route.def";
import { searchRoute } from "./route.def";

// A static route reading searchParams must opt into dynamic rendering (same
// as /find) — and a redirect endpoint could never be usefully prerendered.
export const dynamic = "force-dynamic";

// The legacy-URL pattern: this page never renders. It decodes its own (old)
// search vocabulary and forwards to the current routes. Both redirect() and
// permanentRedirect() take a plain string, and Href is a string subtype, so
// the branded value flows in with no cast — the server-side twin of
// router.push on /products.
export default async function SearchPage(props: RouteProps) {
  const result = await searchRoute.safeParseSearch(props);
  // An inbound legacy URL should never 500: a malformed query just forwards
  // to the unfiltered list.
  if (result.status === "error") redirect(href(productsListRoute));

  const { keyword, product, tag } = result.data;

  // Old product deep links (?product=4) moved for good: a 308. Browsers
  // cache permanent redirects aggressively — reserve permanentRedirect for
  // URLs that will truly never come back.
  if (product !== undefined) {
    permanentRedirect(href(productsRoute, { params: { id: product } }));
  }

  // Vocabulary translation: keyword→q, tag→tags. An undefined keyword flows
  // straight through — explicit undefined is a second spelling of absence
  // (S3) — and anything equal to a value-form default elides on the way out
  // (D8), so the built URL is already canonical.
  redirect(href(productsListRoute, { search: { q: keyword, tags: tag } }));
}
