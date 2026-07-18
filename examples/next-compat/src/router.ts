/**
 * Pins `packages/next/src/types/next-router.d.ts` against real Next — the
 * /pages twin of `navigation.ts` (design-06 PR13).
 *
 * `@paramour-js/next` is hermetic: it declares `next` as a peer only and
 * typechecks against a hand-authored `declare module "next/router"`. That
 * ambient is a claim about a package the shipped code never sees. Here —
 * where a real Next IS installed, and `next/router` resolves to Next's own
 * types — the claim gets checked.
 *
 * The ambient declares `useRouter().query: ParamsSource`, so asserting real
 * Next's `query` against `ParamsSource` below *is* asserting it against the
 * ambient, with no hand-copied shape in between to drift.
 *
 * Type-level only: the hook is never called (this file is `tsc --noEmit`'d,
 * never executed, and calling `useRouter` outside React would throw).
 */
import { useRouter } from "next/router";
import type { ParamsSource } from "paramour";

type RealRouter = ReturnType<typeof useRouter>;

// `declare const`, not `{} as T`: an empty object literal satisfies these
// receivers on its own, so an assertion would let the check pass without
// ever involving Next's real types.
declare const realRouter: RealRouter;

/**
 * Guard the guards. If `next/router` ever resolved to `any` — a broken
 * `moduleResolution`, a Next release shipping an untyped router — every
 * assertion below would pass vacuously and this file would be worse than
 * useless.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;
declare const routerIsAny: IsAny<RealRouter>;
export const _routerIsTyped: false = routerIsAny;

/**
 * The contract `pages.ts` depends on: real `useRouter().query` is a legal
 * input to core's decoders (fails if Next widens `ParsedUrlQuery` beyond
 * `string | string[] | undefined`, or if the router value goes async), and
 * `isReady` is a plain boolean.
 */
export const _asPathIsString: string = realRouter.asPath;
export const _isReadyIsBoolean: boolean = realRouter.isReady;
export const _queryFeedsDecoder: ParamsSource = realRouter.query;

/**
 * The ambient's devtools claim (design-12 DT8): real
 * `replace(url, as?, options?): Promise<boolean>` stays call-compatible with
 * the 1-arity `(url: string) => Promise<boolean>` view `pages.ts` consumes
 * for `navigate`.
 */
export const _replaceIsCallable: (url: string) => Promise<boolean> = (url) =>
  realRouter.replace(url);
