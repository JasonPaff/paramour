import { type NextRequest, NextResponse } from "next/server";
import {
  decodeSearch,
  p,
  type SearchConfig,
  SearchDecodeError,
} from "paramour";

import { filterProducts, products } from "../../../lib/products";
import { productsListSearch } from "../../products/route.def";

// Route handlers are scanned but never emitted (§14 — handler typing is
// deferred), so this URL gets no route def and no typed href() can point at
// it. What a handler CAN own today is its search vocabulary: a standalone
// SearchConfig needs no defineAppRoute at all. Module-local on purpose —
// Next type-checks route.ts exports, and nothing else imports it.
//
// Spreading the /products page's config is what keeps the page and its API
// twin speaking the same wire language: one source of truth for the filter
// keys, extended with an API-only page-size knob.
const apiSearch = {
  ...productsListSearch,
  // .default() means a bare /api/products works — and D8 keeps limit=20 out
  // of any URL built with searchToString against this config.
  limit: p.integer().default(20),
} satisfies SearchConfig;

export function GET(request: NextRequest) {
  // request.nextUrl.searchParams is a URLSearchParams — a SearchSource
  // as-is, no conversion. decodeSearch is sync: unlike the route methods
  // (which await Next's props promises), a handler already holds the
  // decoded-value layer.
  let decoded;
  try {
    decoded = decodeSearch(apiSearch, request.nextUrl.searchParams);
  } catch (error) {
    // The decode-error → HTTP mapping every real API needs: one issue per
    // failed key, and a bad query string is the CALLER's error (400), never
    // a 500. Unknown keys can't get here at all — they are ignored (P8).
    if (error instanceof SearchDecodeError) {
      return NextResponse.json({ issues: error.issues }, { status: 400 });
    }
    throw error;
  }

  const { limit, ...filters } = decoded;
  return NextResponse.json({
    products: filterProducts(products, filters).slice(0, limit),
  });
}
