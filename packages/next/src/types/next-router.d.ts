/**
 * Minimal ambient view of `next/router` — the /pages twin of
 * `next-navigation.d.ts` (design-06 PR13) — so `@paramour-js/next`
 * typechecks and builds WITHOUT materializing Next in the workspace
 * (`next` stays peer-only on purpose).
 *
 * This is a hand-authored `.d.ts` *input*: tsc does not re-emit it, and the
 * emitted `pages.d.ts` references only `paramour` types (the `next/router`
 * import is runtime-only), so nothing here leaks to consumers — their real
 * Next resolves the runtime import.
 *
 * It covers exactly what `pages.ts` consumes: `useRouter()` returning
 * `query` + `isReady`. `query` is declared as core's `ParamsSource` rather
 * than a hand-copied `Record<...>` — it is forwarded straight into core's
 * decoders, and naming the type instead of restating it removes the drift.
 * `examples/next-compat/src/router.ts` pins real Next's `useRouter().query`
 * against `ParamsSource` on every supported major, which — because the
 * ambient IS `ParamsSource` — is exactly a check that this declaration
 * still holds. (`useRouter`'s throw-on-unmounted under `app/` is runtime
 * behavior — covered by `pages.test.tsx` and the example apps, not
 * pinnable here.)
 */
declare module "next/router" {
  export function useRouter(): {
    isReady: boolean;
    query: import("paramour").ParamsSource;
  };
}
