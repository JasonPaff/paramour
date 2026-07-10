import type { AppProps } from "next/app";
import Head from "next/head";

import { Nav } from "../components/nav";
import "../styles/globals.css";

// Pages Router shell: global CSS may only be imported here, and there is no
// layout.tsx — _app is where the persistent chrome lives.
export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>paramour — pages-router example</title>
        <meta
          content="Pages Router example of paramour: typed routes, parseContext in getServerSideProps, and the three-state client hooks."
          name="description"
        />
      </Head>
      <div className="shell">
        <header className="topbar">
          <Nav />
        </header>
        <Component {...pageProps} />
      </div>
    </>
  );
}
