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
 * `query` + `isReady`, plus `asPath` (the basePath-/locale-relative
 * resolution base) and `replace` for the devtools `navigate` capability
 * (design-12 DT8). `query` is declared as core's `ParamsSource`
 * rather than a hand-copied `Record<...>` — it is forwarded straight into
 * core's decoders, and naming the type instead of restating it removes the
 * drift. Real Next's `replace(url, as?, options?): Promise<boolean>` is
 * call-compatible with the 1-arity view declared here.
 *
 * The declared specifier is the extensionful `next/router.js` — it must
 * match pages.ts's import exactly (see the comment there: the bare form
 * dies under Node ESM resolution when the package is externalized on
 * Next 15). Consumers' TS resolves the same specifier to real Next's
 * root `router.d.ts` stub.
 * `examples/next-compat/src/router.ts` pins real Next's `useRouter().query`
 * against `ParamsSource` (and `replace`'s assignability) on every supported
 * major, which — because the ambient IS `ParamsSource` — is exactly a
 * check that this declaration still holds. (`useRouter`'s
 * throw-on-unmounted under `app/` is runtime behavior — covered by
 * `pages.test.tsx` and the example apps, not pinnable here.)
 */
declare module "next/router.js" {
  export function useRouter(): {
    asPath: string;
    isReady: boolean;
    query: import("paramour").ParamsSource;
    replace(url: string): Promise<boolean>;
  };
}
