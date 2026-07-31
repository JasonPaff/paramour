/**
 * Inert resolution shim for the `next/navigation` and `next/router.js`
 * specifiers, wired in via a Vitest `alias` (root `vitest.config.ts`).
 *
 * `next` is peer-only on purpose (never materialized in the workspace), but
 * `src/app.ts` / `src/pages.ts` still carry static imports of it for their
 * real-Next fallback adapters (design-16 TA3) — imports Vite must RESOLVE to
 * load those modules, even though no test may ever call through them: after
 * the TA7 migration every hook suite supplies its framework reads via the
 * `@paramour-js/next/testing` provider (or a hand-built adapter on the seam
 * context). So this shim carries no state and no `__set*` choreography —
 * every export throws, which IS the assertion that the real-Next fallback
 * path stays unreached under test.
 *
 * One file serves both specifiers: the flavors' `useRouter` shapes differ,
 * but a never-returning throw satisfies either, and the extra named exports
 * are invisible to the `next/router.js` consumer.
 */
function absent(): never {
  throw new Error(
    "next is not installed in the workspace — render hooks under " +
      "ParamourTestingProvider (or a seam-context adapter) instead of the " +
      "real-Next fallback (design-16 TA7)",
  );
}

export const useParams = absent;
export const usePathname = absent;
export const useRouter = absent;
export const useSearchParams = absent;
