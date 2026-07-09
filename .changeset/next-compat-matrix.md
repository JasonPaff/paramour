---
"@paramour-js/next": patch
---

Fix the hand-authored `next/navigation` ambient under-declaring `useParams`, and pin paramour's assumptions about Next against a real Next in CI.

`@paramour-js/next` is hermetic — `next` is a peer dependency and the package typechecks against a hand-written `declare module "next/navigation"`. That ambient declared `useParams(): Record<string, string | string[]>`, but real Next is `useParams<T extends Params = Params>(): T` where `Params = Record<string, string | string[] | undefined>`. The ambient was _narrower_ than reality, so the client hooks were typed as though Next never returns undefined param values. Not a runtime bug — `client.ts` forwards the value straight into `decodeParams`/`safeDecodeParams`, whose `ParamsSource` already admits `undefined` — but the declaration was a lie, and nothing caught it because no test in the repo ever loaded Next.

`useParams` is now declared as core's `ParamsSource`, naming the type the hooks actually forward into rather than restating its shape. A compile-time guard (`packages/next/test/ambient-navigation.ts`) asserts the ambient is exactly `ParamsSource` in both directions, so narrowing it again fails `typecheck`.

The other half is a new private workspace package, `examples/next-compat`, which imports a **real** Next and typechecks four previously unverified claims: that Next's `useParams`/`useSearchParams` return values are legal `ParamsSource`/`SearchSource` decoder inputs (and are not `any`); that Next's `PHASE_DEVELOPMENT_SERVER`/`PHASE_PRODUCTION_BUILD` still equal the strings `with-typed-routes.ts` hardcodes — a divergence would silently turn `withTypedRoutes` into a no-op; that a real page's props are assignable to core's `RouteProps`; and that `withTypedRoutes(...)`'s return is a valid `next.config.ts` default export. It runs in the existing CI job against Next 16 and in a new `next-compat` matrix job against Next 15.5.20 and 16.2.10, making `DESIGN.md` §12's "latest two majors, verified in CI matrix" true rather than aspirational.
