/**
 * Minimal ambient view of `next/navigation`, so `@paramour-js/next` typechecks
 * and builds WITHOUT materializing Next in the workspace — the same hermetic
 * stance `with-typed-routes.ts` takes with its structural Next-config view
 * (design-05 TR4; `pnpm-workspace.yaml` keeps `next` peer-only on purpose).
 *
 * This is a hand-authored `.d.ts` *input*: tsc does not re-emit it to `dist`,
 * and the emitted `app.d.ts` references only `paramour`/`react` types (the
 * `next/navigation` import is runtime-only), so nothing here leaks to
 * consumers — their real Next resolves the runtime import.
 *
 * The signatures must be WIDE ENOUGH to hold every value real Next can return,
 * or the hooks are typed on a lie. Real Next:
 *   useParams<T extends Params = Params>(): T   // Params = Record<string, string | string[] | undefined>
 *   useSearchParams(): ReadonlyURLSearchParams  // extends URLSearchParams
 *
 * `useParams` is declared as core's `ParamsSource | null` rather than a
 * hand-copied `Record<...>`: the non-null half must agree with core (it is
 * forwarded straight into `decodeParams`), and naming the type removes the
 * drift. The `| null` is deliberate and reflects runtime truth Next's OWN
 * types omit: outside an App-Router tree — a hybrid app's pages-router initial
 * render — `useParams()` returns `null` (Next #48058/#64952). `app.ts`
 * coalesces that `null` to `{}` so the hooks degrade to "params missing"
 * instead of crashing. `examples/next-compat` typechecks real Next's (non-null)
 * return against `ParamsSource` on every supported major.
 */
declare module "next/navigation" {
  export function useParams(): import("paramour").ParamsSource | null;
  export function useSearchParams(): URLSearchParams;
}
