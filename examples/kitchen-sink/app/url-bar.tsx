"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

// The wire form of whatever URL you are looking at, tokenized: path segments,
// search keys, search values, hash. Every page below renders the DECODED values
// of this same URL in a key/value grid — wire on top, in-memory types beneath.
// That pairing is the whole library in one screen.
export function UrlBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hash = useHash();

  // Hybrid app: Next types both hooks as nullable (they can legally render
  // under the Pages Router). This bar only ever mounts under app/, so null
  // simply renders as an empty URL.
  const segments = (pathname ?? "")
    .split("/")
    .filter((segment) => segment !== "");
  const pairs = [...(searchParams ?? new URLSearchParams()).entries()];

  return (
    <div className="wire">
      <span className="wire__label">url</span>
      <span>
        {segments.length === 0 && <span className="wire__punct">/</span>}
        {segments.map((segment, index) => (
          <Fragment key={`${String(index)}-${segment}`}>
            <span className="wire__punct">/</span>
            <span className="wire__seg">{segment}</span>
          </Fragment>
        ))}
        {pairs.map(([key, value], index) => (
          <Fragment key={`${String(index)}-${key}`}>
            <span className="wire__punct">{index === 0 ? "?" : "&"}</span>
            <span className="wire__key">{key}</span>
            <span className="wire__punct">=</span>
            {/* Re-encoded rather than shown decoded: this is the byte layer,
                and paramour's buildSearchString percent-encodes spaces as %20
                (never `+`). Displaying the decoded value would hide that. */}
            <span className="wire__val">{encodeURIComponent(value)}</span>
          </Fragment>
        ))}
        {hash !== "" && <span className="wire__hash">#{hash}</span>}
      </span>
    </div>
  );
}

// The fragment never reaches the server and no router hook exposes it, so it is
// read from the document after mount.
function useHash(): string {
  const [hash, setHash] = useState("");

  useEffect(() => {
    const read = () => {
      setHash(window.location.hash.replace(/^#/, ""));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      window.removeEventListener("hashchange", read);
    };
  }, []);

  return hash;
}
