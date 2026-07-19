/**
 * Pins `RouteProps` (core `route.ts` RL6) against the shape a real Next App
 * Router page receives. Core stays framework-agnostic and deliberately does
 * NOT reference Next's generated `PageProps` global — which also doesn't exist
 * in a fresh clone before `next build`/`next dev` first runs, so asserting
 * against it here would couple this check to a prior build.
 *
 * The manual shape below is what Next 15/16 actually pass: both members are
 * present and Promise-wrapped (async params landed in Next 15).
 */
import type { RouteProps } from "paramour";

interface NextPageProps {
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

declare const nextPageProps: NextPageProps;

/**
 * `RouteProps` types both members as optional `Promise<ParamsSource>`, so a
 * page's required-and-promised props are assignable to it. This is the
 * assignment every `route.parse(props)` call site relies on. (The build-app
 * sibling check covers the other direction: Next 15.5's generated page check
 * requires the members to be promise-only, so `RouteProps` must not regrow
 * a sync arm.)
 */
export const _propsAssignable: RouteProps = nextPageProps;

/**
 * `RouteProps` must not have decayed into something that accepts anything —
 * a page cannot hand `parse` a bare string.
 */
// @ts-expect-error -- RouteProps is a structural props object, not a string.
export const _routePropsIsNotAny: RouteProps = "not-props";
