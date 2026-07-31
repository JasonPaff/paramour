"use client";

import type { ParamsSource } from "paramour";
import type { ReactElement, ReactNode } from "react";

import { useRef, useState } from "react";

import type {
  AppNavigationAdapter,
  PagesNavigationAdapter,
} from "./navigation-adapter.js";

import {
  AppNavigationContext,
  PagesNavigationContext,
} from "./navigation-adapter.js";

/**
 * `@paramour-js/next/testing` (design-16): a provider that overrides the
 * hooks' framework reads through the adapter seam (TA1), so client
 * components calling `useSearch`/`useRouteParams` (either flavor) can be
 * unit-tested without runner-specific `next/*` module mocking. One provider
 * feeds BOTH flavor contexts (TA5) — hybrid apps and pages components need
 * no second import. Server code needs none of this: `parse`/`safeParse` and
 * server components are pure functions over props (TA8).
 *
 * This module imports ONLY react and the (Next-free) adapter-seam module —
 * no `next/*` specifier and no `@testing-library/*` (TA5; dist.test.ts pins
 * the bundle graph, and the hermeticity check there is why these docs never
 * spell out the two Next specifiers). It carries `"use client"` like
 * app.ts.
 *
 * Stability contract (TA4): the provider holds ONE adapter pair for its
 * lifetime, created once and closing over a latest-props ref that is
 * reassigned every render — prop changes mutate what the stable adapters
 * RETURN, they never mint new adapters, so the hooks' context reads stay
 * identity-stable and mid-test URL changes are driven by ordinary rerenders
 * with new props.
 */

/**
 * Input shape mirrors what Next hands the hooks (TA6) — no `url`
 * reverse-matching in v1 (deferred: needs a core matcher). `params: null`
 * and `mounted: false` are first-class because they are the two states
 * nobody hand-rolling a mock models.
 */
export interface ParamourTestingOptions {
  /**
   * Pages flavor only: `false` is the pre-hydration state of a
   * statically-optimized page (`query` not yet populated — the PR5
   * `pending` arm). Defaults to `true`. design-16 listed this as deferred,
   * but TA7 migrates the whole pages suite — which pins the pending arm —
   * to this provider, so it was promoted from the deferred list.
   */
  isReady?: boolean;
  /**
   * Pages flavor only: `false` reproduces the pages router's
   * throw-on-unmounted state under `app/` (PR5) — pages.ts translates it to
   * a `ParamourError` naming the actual mistake.
   */
  mounted?: boolean;
  /** Captures `replace(href)` from either flavor's router. */
  onReplace?: (href: string) => void;
  /**
   * `null` is the hybrid-app `useParams()` state outside an App-Router tree
   * (Next #48058 family) and passes through as `null`; omitted means `{}`.
   */
  params?: null | ParamsSource;
  /** Defaults to `"/"`. */
  pathname?: string;
  /** `"?page=2"` and `"page=2"` are both accepted. */
  search?: string | URLSearchParams;
}

interface LatestOptions {
  readonly current: ParamourTestingOptions;
}

/**
 * Renders BOTH flavor contexts' providers around `children` (TA5). Exported
 * for people composing their own wrappers (Storybook decorators, custom
 * render helpers); testing-library users want {@link withParamourTesting}.
 */
export function ParamourTestingProvider(
  props: ParamourTestingOptions & { children?: ReactNode },
): ReactElement {
  // Latest-ref pattern (TA4): reassigned every render so the stable
  // adapters below always read the CURRENT render's props.
  const latest = useRef<ParamourTestingOptions>(props);
  latest.current = props;
  const [adapters] = useState(() => createAdapters(latest));
  return (
    <AppNavigationContext.Provider value={adapters.app}>
      <PagesNavigationContext.Provider value={adapters.pages}>
        {props.children}
      </PagesNavigationContext.Provider>
    </AppNavigationContext.Provider>
  );
}

/**
 * Wrapper-component form for testing-library's `wrapper` option (TA5,
 * mirroring `withNuqsTestingAdapter`).
 */
export function withParamourTesting(
  options: ParamourTestingOptions = {},
): (props: { children?: ReactNode }) => ReactElement {
  return function ParamourTestingWrapper({
    children,
  }: {
    children?: ReactNode;
  }): ReactElement {
    return (
      <ParamourTestingProvider {...options}>{children}</ParamourTestingProvider>
    );
  };
}

/**
 * The one adapter pair a provider instance ever holds (TA4). Every read
 * defers to `latest.current`, so the adapters are stable while their
 * answers track prop updates. Fresh `URLSearchParams` per call is fine —
 * the hooks fingerprint the declared slice (SEL4), not the instance.
 */
function createAdapters(latest: LatestOptions): {
  app: AppNavigationAdapter;
  pages: PagesNavigationAdapter;
} {
  const app: AppNavigationAdapter = {
    useParams() {
      const { params } = latest.current;
      // `null` must pass through as-is — it is the hybrid-app state the
      // app hooks deliberately tolerate; only OMITTED means `{}`.
      return params === undefined ? {} : params;
    },
    usePathname() {
      return latest.current.pathname ?? "/";
    },
    useRouter() {
      return {
        replace(href: string): void {
          latest.current.onReplace?.(href);
        },
      };
    },
    useSearchParams() {
      return new URLSearchParams(normalizeSearch(latest.current.search));
    },
  };
  const pages: PagesNavigationAdapter = {
    useRouter() {
      const options = latest.current;
      if (options.mounted === false) {
        // Verbatim prefix of next/router's real unmounted error — pages.ts
        // matches on the message to translate it (PR5).
        throw new Error(
          "NextRouter was not mounted. https://nextjs.org/docs/messages/next-router-not-mounted",
        );
      }
      const search = normalizeSearch(options.search);
      return {
        // asPath derives from pathname + normalized search (TA6) —
        // basePath-relative, what the devtools navigate capability resolves
        // against (DT8).
        asPath: (options.pathname ?? "/") + (search === "" ? "" : `?${search}`),
        isReady: options.isReady ?? true,
        query: mergedQuery(options),
        replace(url: string): Promise<boolean> {
          latest.current.onReplace?.(url);
          // Real next/router resolves `true` on a completed replace (TA6).
          return Promise.resolve(true);
        },
      };
    },
  };
  return { app, pages };
}

/**
 * The merged `query` bag real Next hands the pages router: search entries
 * first (single value → scalar, repeats → `string[]`), then `params`
 * entries override — path params win, mirroring real Next's merge.
 * Entries → fromEntries for define-semantics, so a hostile `"__proto__"`
 * key stays an ordinary own property (omitPathParams's ethos in pages.ts).
 */
function mergedQuery(options: ParamourTestingOptions): ParamsSource {
  const entries: [string, string | string[] | undefined][] = [];
  const searchParams = new URLSearchParams(normalizeSearch(options.search));
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    const first = values[0];
    // Unreachable for a key yielded by keys(); satisfies
    // noUncheckedIndexedAccess without a cast.
    if (first === undefined) continue;
    entries.push([key, values.length === 1 ? first : values]);
  }
  for (const entry of Object.entries(options.params ?? {})) {
    entries.push(entry);
  }
  return Object.fromEntries(entries);
}

/** `undefined` → `""`; `URLSearchParams` → its string; strip one leading `?`. */
function normalizeSearch(search: ParamourTestingOptions["search"]): string {
  if (search === undefined) return "";
  if (typeof search === "string") {
    return search.startsWith("?") ? search.slice(1) : search;
  }
  return search.toString();
}
