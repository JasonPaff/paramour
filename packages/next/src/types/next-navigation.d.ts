/**
 * Minimal ambient view of `next/navigation`, so `@paramour-js/next` typechecks
 * and builds WITHOUT materializing Next in the workspace — the same hermetic
 * stance `with-typed-routes.ts` takes with its structural Next-config view
 * (design-05 TR4; `pnpm-workspace.yaml` keeps `next` peer-only on purpose).
 *
 * This is a hand-authored `.d.ts` *input*: tsc does not re-emit it to `dist`,
 * and the emitted `client.d.ts` references only `paramour`/`react` types (the
 * `next/navigation` import is runtime-only), so nothing here leaks to
 * consumers — their real Next resolves the runtime import. The signatures are
 * intentionally the narrow subset the hooks use; real Next's types are
 * structurally compatible supersets (`ReadonlyURLSearchParams extends
 * URLSearchParams`; `useParams`'s default generic).
 */
declare module "next/navigation" {
  export function useParams(): Record<string, string | string[]>;
  export function useSearchParams(): URLSearchParams;
}
