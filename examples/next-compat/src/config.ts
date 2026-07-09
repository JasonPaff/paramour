/**
 * Pins `withTypedRoutes`'s return against what a real `next.config.ts` may
 * export by default.
 *
 * The wrapper takes a structural `NextConfigLike` view (TR4) and returns
 * `ConfigFunction<C> = (phase: string, ctx: unknown) => C | Promise<C>`. Next
 * has no stable named export for the function-config form, so its documented
 * shape is re-declared here and the wrapper's return asserted against it. Fails
 * if Next ever tightens the config-function signature — e.g. narrows the return
 * or demands a typed context — which would break every consumer's next.config.
 */
import { withTypedRoutes } from "@paramour-js/next";
import type { NextConfig } from "next";

type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;

const config: NextConfig = { pageExtensions: ["tsx", "ts"] };

export const _wrappedIsConfigFn: NextConfigFn = withTypedRoutes(config, {
  strict: true,
});

/** The bare-object form (no wrapper) must stay assignable too. */
export const _plainConfigStillWorks: NextConfigFn = withTypedRoutes(config);
