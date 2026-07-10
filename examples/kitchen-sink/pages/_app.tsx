import type { AppProps } from "next/app";

import "../app/globals.css";

// Hybrid app: this shell wraps only the pages/ side (the app/ side has its
// own layout.tsx). Top-level _app is excluded from route scanning — only
// /legacy below registers in pagesRoutes.
export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="shell">
      <Component {...pageProps} />
    </div>
  );
}
