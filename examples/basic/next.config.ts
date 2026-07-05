import { withTypedRoutes } from "@paramour-js/next";
import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Pin the monorepo root: stray lockfiles outside the repo must not sway
  // Next's workspace-root inference (file tracing, watch scope).
  turbopack: { root: join(__dirname, "..", "..") },
};

// strict: true — the committed paramour-env.d.ts is the law; a CI
// `next build` fails on artifact drift (TR3/TR4 committed-file contract).
export default withTypedRoutes(nextConfig, { strict: true });
