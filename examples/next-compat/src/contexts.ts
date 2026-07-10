/**
 * Pins core's structural `PagesContext` (route.ts, PR10) against real Next.
 *
 * `parseContext` claims that `getServerSideProps` and `getInitialProps`
 * contexts compose with it while `getStaticProps` is rejected — claims about
 * Next's types that core, being framework-agnostic, states structurally and
 * cannot check itself. Here — where a real Next IS installed — each claim is
 * re-checked on every supported major instead of resting on a one-time
 * manual verification (PR13).
 *
 * Type-level only: nothing here runs; the file is `tsc --noEmit`'d.
 */
import type {
  GetServerSidePropsContext,
  GetStaticPropsContext,
  NextPageContext,
} from "next";
import type { PagesContext } from "paramour";

declare const gsspContext: GetServerSidePropsContext;
declare const pageContext: NextPageContext;
declare const gspContext: GetStaticPropsContext;

/**
 * Guard the guards. If `next` resolved to `any`, the positive pins below
 * would pass vacuously and the `@ts-expect-error` pin would fail confusingly.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;
declare const gsspIsAny: IsAny<GetServerSidePropsContext>;
declare const pageContextIsAny: IsAny<NextPageContext>;
export const _gsspIsTyped: false = gsspIsAny;
export const _pageContextIsTyped: false = pageContextIsAny;

/**
 * The `getServerSideProps` contract: `params` (optional) and `query` are
 * separate, synchronous, and decoder-legal. Fails if Next widens the value
 * types beyond `string | string[] | undefined` or makes either async.
 */
export const _gsspAssignable: PagesContext = gsspContext;

/**
 * The `getInitialProps` contract: `NextPageContext` carries `query` but no
 * `params` — parseContext's extract-by-name fallback exists exactly for this
 * shape (PR10).
 */
export const _pageContextAssignable: PagesContext = pageContext;

/**
 * `getStaticProps` deliberately does NOT compose (PR10): its context has no
 * `query` — at build time there is no query string, and typed search there
 * would be a lie. If Next ever ADDS `query` to `GetStaticPropsContext`, this
 * expectation fails and the PR10 stance needs re-deciding, which is the
 * point of pinning it.
 */
// @ts-expect-error -- GetStaticPropsContext has no query member (PR10).
export const _gspRejected: PagesContext = gspContext;
