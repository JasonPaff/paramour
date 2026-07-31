import type { ParamsSource } from "paramour";

import { createContext } from "react";

/**
 * Adapter seam for the client hooks' framework reads (design-16 TA1): each
 * flavor's hooks resolve Next through a React context so the /testing entry
 * can override the reads without runner-specific module mocking.
 * Deliberately NO `"use client"` directive — app.ts (which carries one) and
 * pages.ts (which must not, PR2) both import from here, like
 * observe.ts/select.ts; the directive belongs on the entry modules, not a
 * shared leaf.
 *
 * This module is Next-free on purpose (TA3): the contexts default to `null`
 * and each flavor ENTRY supplies its own real-Next fallback
 * (`useContext(ctx) ?? realAdapter`), so neither this module nor the
 * /testing entry ever drags a `next/*` specifier into its graph. The
 * dist.test.ts bundle-hygiene invariants (/app reaches only
 * `next/navigation`, /pages only `next/router.js`, /testing neither) depend
 * on exactly this split — a context whose DEFAULT VALUE were the real
 * adapter would break all three.
 */

/**
 * App-flavor adapter: EXACTLY the ambient view of `next/navigation` declared
 * in `src/types/next-navigation.d.ts` — that ambient is the contract of
 * record, and this interface must stay in lockstep with it (TA2; the
 * `examples/next-compat` pins guard the real-Next side). `useParams()`'s
 * `null` arm is the outside-App-Router-tree state (Next #48058 family) the
 * hooks deliberately tolerate; `useRouter().replace`/`usePathname` are the
 * devtools `navigate` capability's write path and resolution base (DT8).
 */
export interface AppNavigationAdapter {
  useParams(): null | ParamsSource;
  usePathname(): string;
  useRouter(): { replace(href: string): void };
  useSearchParams(): URLSearchParams;
}

/**
 * Pages-flavor adapter: EXACTLY the ambient view of `next/router.js`
 * declared in `src/types/next-router.d.ts` — that ambient is the contract of
 * record, and this interface must stay in lockstep with it (TA2). The
 * ambient's throw-on-unmounted behavior under `app/` (PR5) is part of the
 * contract: adapter implementations reproduce it by THROWING from
 * `useRouter()`, which pages.ts translates.
 */
export interface PagesNavigationAdapter {
  useRouter(): {
    asPath: string;
    isReady: boolean;
    query: ParamsSource;
    replace(url: string): Promise<boolean>;
  };
}

/**
 * The `null` default is load-bearing (TA3): with no provider mounted,
 * app.ts falls back to its real `next/navigation` adapter — zero markup and
 * zero behavior change in production (TA4).
 */
export const AppNavigationContext = createContext<AppNavigationAdapter | null>(
  null,
);

/** The pages twin; `null` default load-bearing for the same TA3 reasons. */
export const PagesNavigationContext =
  createContext<null | PagesNavigationAdapter>(null);
