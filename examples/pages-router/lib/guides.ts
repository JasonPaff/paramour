// Finite SSG dataset: these three topics are the whole universe, so
// getStaticPaths enumerates them at build time and fallback: "blocking"
// only ever fields URLs outside the enum — which the decode rejects to 404.
export const guideTopics = ["codecs", "codegen", "routing"] as const;

export type GuideTopic = (typeof guideTopics)[number];

export interface Guide {
  body: string;
  title: string;
}

export const guides: Record<GuideTopic, Guide> = {
  codecs: {
    body: "Codecs are bidirectional wire converters: a strict anchored grammar parses the URL string into a real value, and a serializer writes it back. Standard Schema is validate-only, so serialization is what the library owns.",
    title: "Codecs: strings in, types out",
  },
  codegen: {
    body: "The paramour CLI scans the pages/ (or app/) tree and emits a .d.ts artifact registering every route path. withTypedRoutes({ strict: true }) makes next build fail on drift, so the artifact can never go stale in CI.",
    title: "Codegen and the drift contract",
  },
  routing: {
    body: "Route objects are the currency: define once, then href(), the hooks, and the server parsers all share the same params and search types. No string-keyed registry, nothing to keep in sync by hand.",
    title: "Typed routing in the Pages Router",
  },
};
