/**
 * Pins `packages/next/src/types/next-navigation.d.ts` against real Next.
 *
 * `@paramour-js/next` is hermetic: it declares `next` as a peer only and
 * typechecks against a hand-authored `declare module "next/navigation"`. That
 * ambient is a claim about a package the shipped code never sees. Here — where
 * a real Next IS installed, and `next/navigation` resolves to Next's own
 * types — the claim gets checked.
 *
 * The ambient declares `useParams(): ParamsSource`, so asserting real Next's
 * return against `ParamsSource` below *is* asserting it against the ambient,
 * with no hand-copied shape in between to drift.
 *
 * Type-level only: the hooks are never called (this file is `tsc --noEmit`'d,
 * never executed, and calling a client hook outside React would throw).
 */
import { useParams, useSearchParams } from "next/navigation";
import type { ParamsSource, SearchSource } from "paramour";

type RealParams = ReturnType<typeof useParams>;
type RealSearch = ReturnType<typeof useSearchParams>;

// `declare const`, not `{} as T`: an empty object literal satisfies these
// receivers on its own, so an assertion would let the check pass without ever
// involving Next's real types.
declare const realParams: RealParams;
declare const realSearch: RealSearch;

/**
 * Guard the guards. If `next/navigation` ever resolved to `any` — a broken
 * `moduleResolution`, a Next release shipping untyped hooks — every assertion
 * below would pass vacuously and this file would be worse than useless.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;
declare const paramsAreAny: IsAny<RealParams>;
declare const searchIsAny: IsAny<RealSearch>;
export const _paramsAreTyped: false = paramsAreAny;
export const _searchIsTyped: false = searchIsAny;

/**
 * The contract `client.ts` depends on: whatever real Next hands back is a
 * legal input to core's decoders, which is all the hooks do with it.
 *
 * `useParams` fails here if Next widens `Params` beyond
 * `string | string[] | undefined`, or if either hook goes async — a Promise is
 * not a `ParamsSource`, and async client hooks are a live direction for Next.
 */
export const _paramsFeedDecoder: ParamsSource = realParams;
export const _searchFeedDecoder: SearchSource = realSearch;

/**
 * Real Next: `useSearchParams(): ReadonlyURLSearchParams`, and
 * `class ReadonlyURLSearchParams extends URLSearchParams` — so the ambient's
 * `URLSearchParams` return holds. Fails if Next breaks that inheritance.
 */
export const _searchIsUrlSearchParams: URLSearchParams = realSearch;
