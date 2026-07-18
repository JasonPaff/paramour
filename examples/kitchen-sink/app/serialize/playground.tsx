"use client";

import {
  buildPath,
  buildSearchString,
  decodeParams,
  decodeSearch,
  encodeParams,
  encodeSearch,
  href,
  type InferSearchInput,
  ParamourError,
  ParamsDecodeError,
  ParseError,
  SearchDecodeError,
  searchToString,
  SerializeError,
} from "paramour";
import { useState } from "react";

import { demoSearch } from "../../lib/codecs";
import { productsRoute } from "../products/[id]/route.def";

// Classify a caught throw across the error hierarchy. The two aggregate errors
// carry `.issues`; every branch below is also `instanceof ParamourError` — the
// documented contract that every throw from paramour is a ParamourError.
function describe(error: unknown): string {
  if (
    error instanceof SearchDecodeError ||
    error instanceof ParamsDecodeError
  ) {
    const issues = error.issues
      .map((issue) => `${issue.key}: ${issue.message}`)
      .join(" · ");
    return `${error.name} (issues) → ${issues}`;
  }
  if (error instanceof SerializeError)
    return `SerializeError → ${error.message}`;
  if (error instanceof ParseError) return `ParseError → ${error.message}`;
  if (error instanceof ParamourError) return `ParamourError → ${error.message}`;
  return `Unknown → ${String(error)}`;
}

function splitCsv(value: string): string[] {
  return value.split(",").filter((segment) => segment !== "");
}

// A thrown SerializeError/decode error renders as text rather than a rethrow.
// The `failed` flag is what lets the UI show it as an error instead of letting
// it read like a successful result.
interface Attempt {
  failed: boolean;
  text: string;
}

function attempt(run: () => string): Attempt {
  try {
    return { failed: false, text: run() };
  } catch (error) {
    return { failed: true, text: describe(error) };
  }
}

export function Playground() {
  const [id, setId] = useState("42");
  const [q, setQ] = useState("cable");
  const [labels, setLabels] = useState("sale,new");
  const [tags, setTags] = useState("usb-c,braided");
  const [page, setPage] = useState("2");
  const [query, setQuery] = useState("labels=a,b&q=hi&tags=x&tags=y&page=3");

  // encode side of the search config — labels is required (a p.csv codec with
  // no presence modifier); q/page/tags are omittable.
  const searchInput: InferSearchInput<typeof demoSearch> = {
    labels: splitCsv(labels),
    tags: splitCsv(tags),
  };
  if (q !== "") searchInput.q = q;
  if (page !== "") searchInput.page = Number(page);

  const path = attempt(() => buildPath(productsRoute, { id: Number(id) }));
  const segments = attempt(() =>
    JSON.stringify(encodeParams(productsRoute, { id: Number(id) })),
  );
  const decodedParams = attempt(() =>
    JSON.stringify(decodeParams(productsRoute, { id })),
  );

  const pairs = attempt(() =>
    JSON.stringify(encodeSearch(demoSearch, searchInput)),
  );
  const queryString = attempt(() => searchToString(demoSearch, searchInput));
  const built = attempt(() =>
    buildSearchString(encodeSearch(demoSearch, searchInput)),
  );
  const link = attempt(() =>
    href(productsRoute, { params: { id: Number(id) }, search: {} }),
  );

  const decodedSearch = attempt(() =>
    JSON.stringify(decodeSearch(demoSearch, new URLSearchParams(query))),
  );

  return (
    <div className="stack">
      <section className="section">
        <h2>Path — buildPath / encodeParams / decodeParams</h2>
        <div className="split">
          <div>
            <Field label="id" onChange={setId} value={id} />
            <p className="hint">
              Try <code>id = -5</code> (fails the positive schema on both encode
              and decode) or <code>id = 1.5</code> (not a safe integer).
            </p>
          </div>
          <div>
            <Out label="buildPath(route, { id })" result={path} />
            <Out label="encodeParams(route, { id })" result={segments} />
            <Out
              label="href(route, { params: { id }, search: {} })"
              result={link}
            />
            <Out
              label='decodeParams(route, { id: "<id>" })'
              result={decodedParams}
            />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Search — encodeSearch / searchToString / buildSearchString</h2>
        <div className="split">
          <div>
            <Field label="q (optional)" onChange={setQ} value={q} />
            <Field
              label="labels (required, p.csv codec)"
              onChange={setLabels}
              value={labels}
            />
            <Field label="tags (array)" onChange={setTags} value={tags} />
            <Field
              label="page (default 1 — elided when it equals 1)"
              onChange={setPage}
              value={page}
            />
            <p className="hint">
              Set <code>page = 1</code> to watch D8 elision drop it; clear{" "}
              <code>labels</code> to see the required key still serialize
              (empty), or set <code>page = abc</code> for a{" "}
              <code>SerializeError</code>.
            </p>
          </div>
          <div>
            <Out label="encodeSearch(config, input)" result={pairs} />
            <Out label="searchToString(config, input)" result={queryString} />
            <Out label="buildSearchString(encodeSearch(...))" result={built} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Search — decodeSearch (from a raw query string)</h2>
        <div className="split">
          <div>
            <Field label="query string" onChange={setQuery} value={query} />
            <p className="hint">
              Drop <code>labels=</code> for a <code>SearchDecodeError</code>{" "}
              whose <code>.issues</code> name the missing required key; set{" "}
              <code>labels=a,,b</code> for p.csv&apos;s strict empty-segment{" "}
              <code>ParseError</code>; set <code>page=abc</code> for a per-key{" "}
              <code>ParseError</code> aggregated into the same error.
            </p>
          </div>
          <div>
            <Out
              label="decodeSearch(config, new URLSearchParams(query))"
              result={decodedSearch}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      />
    </label>
  );
}

function Out({ label, result }: { label: string; result: Attempt }) {
  return (
    <div className={result.failed ? "out out--error" : "out"}>
      <code className="out__label">{label}</code>
      <pre>{result.text}</pre>
    </div>
  );
}
