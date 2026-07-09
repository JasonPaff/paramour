/**
 * Minimal ambient view of `next/navigation`, so `@paramour-js/next` typechecks
 * and builds WITHOUT materializing Next in the workspace — the same hermetic
 * stance `with-typed-routes.ts` takes with its structural Next-config view
 * (design-05 TR4; `pnpm-workspace.yaml` keeps `next` peer-only on purpose).
 *
 * This is a hand-authored `.d.ts` *input*: tsc does not re-emit it to `dist`,
 * and the emitted `client.d.ts` references only `paramour`/`react` types (the
 * `next/navigation` import is runtime-only), so nothing here leaks to
 * consumers — their real Next resolves the runtime import.
 *
 * The signatures must be WIDE ENOUGH to hold every value real Next can return,
 * or the hooks are typed on a lie. Real Next:
 *   useParams<T extends Params = Params>(): T   // Params = Record<string, string | string[] | undefined>
 *   useSearchParams(): ReadonlyURLSearchParams  // extends URLSearchParams
 *
 * `useParams` is declared as core's `ParamsSource` rather than a hand-copied
 * `Record<...>`: the two must agree (it is forwarded straight into
 * `decodeParams`), and naming the type instead of restating it removes the
 * drift. `examples/next-compat` then typechecks real Next's return against
 * `ParamsSource` on every supported major, which — because the ambient IS
 * `ParamsSource` — is exactly a check that this declaration still holds.
 */
declare module "next/navigation" {
  export function useParams(): import("paramour").ParamsSource;
  export function useSearchParams(): URLSearchParams;
}
