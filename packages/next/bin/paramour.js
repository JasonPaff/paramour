#!/usr/bin/env node
// Committed bin stub: pnpm creates bin shims at install time and silently
// skips any whose target doesn't exist yet — dist/cli.js only exists after
// a build, so pointing `bin` at it left the examples' shims uncreated (and
// a second install won't retry: an up-to-date lockfile skips the link
// phase). This file always exists, so the shim is always created; it just
// delegates to the built CLI.
import { existsSync } from "node:fs";

const cli = new URL("../dist/cli.js", import.meta.url);

if (!existsSync(cli)) {
  console.error(
    "paramour: @paramour-js/next is not built (dist/cli.js is missing). Run `pnpm build:packages` first.",
  );
  process.exit(1);
}

await import(cli.href);
