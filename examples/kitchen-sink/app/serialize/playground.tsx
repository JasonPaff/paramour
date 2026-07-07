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

// Try/catch wrapper so a thrown SerializeError/decode error renders as text
// rather than a rethrow.
function attempt(run: () => string): string {
  try {
    return run();
  } catch (error) {
    return describe(error);
  }
}

export function Playground() {
  const [id, setId] = useState("42");
  const [q, setQ] = useState("cable");
  const [labels, setLabels] = useState("sale,new");
  const [tags, setTags] = useState("usb-c,braided");
  const [page, setPage] = useState("2");
  const [query, setQuery] = useState("labels=a,b&q=hi&tags=x&tags=y&page=3");

  // encode side of the search config — labels is required (a custom codec with
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
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <section>
        <h2>Path — buildPath / encodeParams / decodeParams (productsRoute)</h2>
        <Field label="id" onChange={setId} value={id} />
        <Out label="buildPath(route, { id })" value={path} />
        <Out label="encodeParams(route, { id })" value={segments} />
        <Out label="href(route, { params: { id }, search: {} })" value={link} />
        <Out
          label='decodeParams(route, { id: "<id>" })'
          value={decodedParams}
        />
        <p>
          Try <code>id = -5</code> (fails the positive schema on both encode and
          decode) or <code>id = 1.5</code> (not a safe integer).
        </p>
      </section>

      <section>
        <h2>Search — encodeSearch / searchToString / buildSearchString</h2>
        <Field label="q (optional)" onChange={setQ} value={q} />
        <Field
          label="labels (required, csv custom codec)"
          onChange={setLabels}
          value={labels}
        />
        <Field label="tags (stringArray)" onChange={setTags} value={tags} />
        <Field
          label="page (default 1 — elided when it equals 1)"
          onChange={setPage}
          value={page}
        />
        <Out label="encodeSearch(config, input)" value={pairs} />
        <Out label="searchToString(config, input)" value={queryString} />
        <Out label="buildSearchString(encodeSearch(...))" value={built} />
        <p>
          Set <code>page = 1</code> to watch D8 elision drop it; clear{" "}
          <code>labels</code> to see the required key still serialize (empty),
          or set <code>page = abc</code> for a <code>SerializeError</code>.
        </p>
      </section>

      <section>
        <h2>Search — decodeSearch (from a raw query string)</h2>
        <Field label="query string" onChange={setQuery} value={query} />
        <Out
          label="decodeSearch(config, new URLSearchParams(query))"
          value={decodedSearch}
        />
        <p>
          Drop <code>labels=</code> for a <code>SearchDecodeError</code> whose{" "}
          <code>.issues</code> name the missing required key; set{" "}
          <code>page=abc</code> for a per-key <code>ParseError</code> aggregated
          into the same error.
        </p>
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
    <label style={{ display: "block", margin: "0.25rem 0" }}>
      <span style={{ display: "inline-block", minWidth: "22rem" }}>
        {label}
      </span>
      <input
        onChange={(event) => {
          onChange(event.target.value);
        }}
        style={{ fontFamily: "monospace" }}
        value={value}
      />
    </label>
  );
}

function Out({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ margin: "0.25rem 0" }}>
      <code style={{ color: "#666" }}>{label}</code>
      <pre
        style={{
          background: "#f4f4f4",
          margin: "0.15rem 0",
          padding: "0.4rem 0.6rem",
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </pre>
    </div>
  );
}
