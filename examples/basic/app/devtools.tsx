"use client";
// design-12 DT13: the user owns the shell — mount TanStackDevtools with the
// paramour plugin yourself. Dev-conditional via the NoOpPlugin pattern:
// NODE_ENV is statically inlined by Next's compilers, so `next build`
// compiles this file and the production bundle renders nothing.
import { paramourDevtoolsPlugin } from "@paramour-js/devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

export function Devtools() {
  if (process.env.NODE_ENV === "production") return null;
  return <TanStackDevtools plugins={[paramourDevtoolsPlugin()]} />;
}
