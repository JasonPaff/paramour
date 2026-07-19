/**
 * Compile-time guard for the hand-authored `next/router` ambient
 * (`src/types/next-router.d.ts`) — the /pages twin of
 * `ambient-navigation.ts`.
 *
 * Deliberately NOT a `*.test.ts`: vitest matches `test/**\/*.test.ts`, so
 * this module never runs. Its assertions ARE the test, enforced by
 * `pnpm --filter @paramour-js/next typecheck`, whose tsconfig includes
 * `test/`. It lives here rather than beside the ambient because
 * `tsconfig.build.json` compiles `src/` into `dist/` — an assertion module
 * there would ship.
 *
 * The ambient is where paramour states what it believes `next/router`
 * returns, and `pages.ts` forwards `query` straight into core's decoders.
 * So `query` must be EXACTLY `ParamsSource`: any narrower and the hooks
 * read real queries through a type that lies about them (real Next's
 * `ParsedUrlQuery` admits `undefined` values); any wider and `pages.ts`
 * stops compiling. `isReady` must be exactly `boolean` — both hydration
 * states are real.
 *
 * `examples/next-compat` owns the other half — that *real* Next still
 * returns something assignable to these shapes — on every supported major.
 */
import type { useRouter } from "next/router.js";
import type { ParamsSource } from "paramour";

type AmbientRouter = ReturnType<typeof useRouter>;

// `declare const` rather than `{} as T`: an empty object literal is
// assignable to these types on its own, so the assertion would be a no-op
// that lint (correctly) flags — and would not test the direction it claims.
declare const ambientRouter: AmbientRouter;
declare const paramsSource: ParamsSource;
declare const someBoolean: boolean;

/** Mutual assignability == the ambient's query type is exactly ParamsSource. */
export const _queryIsNarrowEnough: ParamsSource = ambientRouter.query;
export const _queryIsWideEnough: AmbientRouter["query"] = paramsSource;

/** Mutual assignability == `isReady` is exactly `boolean`. */
export const _isReadyIsNarrowEnough: boolean = ambientRouter.isReady;
export const _isReadyIsWideEnough: AmbientRouter["isReady"] = someBoolean;

/**
 * The ambient's `replace` is the 1-arity `Promise<boolean>` view `pages.ts`
 * consumes for the devtools `navigate` capability (design-12 DT8);
 * `examples/next-compat/src/router.ts` owns the claim that real Next's
 * `replace(url, as?, options?)` stays assignable.
 */
export const _replaceIsCallable: (url: string) => Promise<boolean> = (url) =>
  ambientRouter.replace(url);
