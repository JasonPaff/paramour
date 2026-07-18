import type { NextConfig } from "next";

import { withTypedRoutes } from "@paramour-js/next";
import { createMDX } from "fumadocs-mdx/next";
import { join } from "node:path";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  // Pin the monorepo root: stray lockfiles outside the repo must not sway
  // Next's workspace-root inference (file tracing, watch scope).
  turbopack: { root: join(__dirname, "..") },
};

// withTypedRoutes accepts an object or function config and returns the
// function form, so it must be the outermost wrapper. strict: true — the
// committed paramour-env.d.ts is the law; a CI `next build` fails on drift.
export default withTypedRoutes(withMDX(nextConfig), { strict: true });
