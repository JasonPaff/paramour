import {
  useRouteParams as useAppRouteParams,
  useSearch as useAppSearch,
} from "@paramour-js/next/app";
import {
  useRouteParams as usePagesRouteParams,
  useSearch as usePagesSearch,
} from "@paramour-js/next/pages";

import { productRoute } from "../app/product/[id]/route.def";
import { legacyRoute } from "../lib/legacy.def";

// Hook router gates: each entry point's hooks are bounded to their own
// router's route brand. Mirrors packages/next/test/app-hooks.tst.ts and
// packages/next/test/pages-hooks.tst.ts.

// @expect-error TS2345 — app hooks accept only app routes
useAppRouteParams(legacyRoute);

// @expect-error TS2345 — app hooks accept only app routes
useAppSearch(legacyRoute);

// @expect-error TS2345 — pages hooks accept only pages routes
usePagesRouteParams(productRoute);

// @expect-error TS2345 — pages hooks accept only pages routes
usePagesSearch(productRoute);
