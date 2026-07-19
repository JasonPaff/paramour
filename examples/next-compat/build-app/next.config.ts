import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Deliberately NO transpilePackages: the whole point of this app is that
  // `@paramour-js/next` must survive being loaded as an external (Node ESM
  // resolution during "Collecting page data") — bundling it would paper over
  // exactly the class of bug this build exists to catch. The externalization
  // itself comes from `dependenciesMeta.injected` in ../package.json: hard
  // copies inside node_modules make Next's default externals treatment apply
  // exactly as it does to a real npm install, where workspace SYMLINKS would
  // resolve outside node_modules and get silently bundled — making this
  // whole gate vacuous (verified: the extensionless `next/router` import
  // built green through the symlinks while failing every real Next 15
  // install).
  // Same monorepo-root pin as examples/basic: stray lockfiles outside the
  // repo must not sway Next's workspace-root inference.
  turbopack: { root: join(__dirname, "..", "..", "..") },
};

export default nextConfig;
