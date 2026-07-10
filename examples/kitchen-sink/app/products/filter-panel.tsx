"use client";

import { useSearch } from "@paramour-js/next/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { href, type InferSearchInput, type SearchOutputOf } from "paramour";
import { useEffect, useRef, useState } from "react";

import { allTags, filterProducts, products } from "../../lib/products";
import { productsRoute } from "./[id]/route.def";
import { productsListRoute, productsListSearch } from "./route.def";

type FilterInput = InferSearchInput<typeof productsListSearch>;
type FilterOutput = SearchOutputOf<typeof productsListSearch>;

const PAGE_SIZE = 3;
const sortOptions: readonly FilterOutput["sort"][] = [
  "name",
  "newest",
  "price",
];

// The URL-as-state pattern: useSearch reads the decoded filters, every edit
// writes them back with router.replace(href(...)). The URL is the store —
// back/forward, reload, and share-the-link all just work.
export function FilterPanel() {
  const search = useSearch(productsListRoute);

  // The SAFE hook on purpose: a hand-edited URL (?inStock=maybe) lands here
  // instead of crashing the tree, and recovery is a plain href() link — the
  // form remounts clean, discarding any stale draft state with it.
  if (search.status === "error") {
    return (
      <section className="panel">
        <p className="alert" role="alert">
          search: {search.error.message}
        </p>
        <p>
          <Link href={href(productsListRoute)}>Reset the filters</Link> — every
          key is optional, defaulted, or an array, so href() with no arguments
          is the clean URL.
        </p>
      </section>
    );
  }

  return <Filters data={search.data} />;
}

// Split from FilterPanel so its hooks only ever run against decoded data —
// the error arm above never mounts a half-configured form.
function Filters({ data }: { data: FilterOutput }) {
  const router = useRouter();

  // Local draft for the text input only — discrete controls write straight
  // to the URL. draftQ is what the user sees; data.q is what the URL says.
  const [draftQ, setDraftQ] = useState(data.q ?? "");
  const lastSentQ = useRef(data.q ?? "");

  // Resync on back/forward: when the URL's q changes to something we did not
  // write ourselves, adopt it. The ref guard keeps our own debounced write's
  // echo from clobbering in-flight typing.
  useEffect(() => {
    const urlQ = data.q ?? "";
    if (urlQ !== lastSentQ.current) {
      lastSentQ.current = urlQ;
      setDraftQ(urlQ);
    }
  }, [data.q]);

  // Debounce free typing: one router.replace per pause, not per keystroke —
  // each replace is a server round-trip in the App Router. (For zero
  // round-trips, window.history.replaceState(null, "", href(...)) also
  // works — Next ≥14.1 syncs useSearchParams from it — but router.replace is
  // shown here because it is the general-purpose pattern.)
  useEffect(() => {
    if (draftQ === (data.q ?? "")) return;
    const timer = setTimeout(() => {
      lastSentQ.current = draftQ;
      const draft = toInput(data);
      delete draft.page;
      if (draftQ === "") delete draft.q;
      else draft.q = draftQ;
      router.replace(href(productsListRoute, { search: draft }), {
        scroll: false,
      });
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [data, draftQ, router]);

  // Any filter edit resets paging: deleting `page` from the draft means
  // "absent", which decodes back to the default 1 — and never appears on the
  // wire at all (D8). sort=name vanishes the same way.
  function apply(mutate: (draft: FilterInput) => void) {
    const draft = toInput(data);
    delete draft.page;
    mutate(draft);
    router.replace(href(productsListRoute, { search: draft }), {
      scroll: false,
    });
  }

  function applyPage(page: number) {
    const draft = toInput(data);
    draft.page = page; // 1 elides (D8); anything else serializes
    router.replace(href(productsListRoute, { search: draft }), {
      scroll: false,
    });
  }

  const matches = filterProducts(products, data);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(data.page, pageCount);
  const visible = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="panel">
      <h2>URL-as-state filters</h2>
      <div className="split">
        <div>
          <label className="field">
            <span>q — p.string().optional(), debounced 200 ms</span>
            <input
              onChange={(event) => {
                setDraftQ(event.target.value);
              }}
              placeholder="cable"
              value={draftQ}
            />
          </label>
          <label className="field">
            <span>sort — .default(&quot;name&quot;) elides (D8)</span>
            <select
              onChange={(event) => {
                apply((draft) => {
                  draft.sort = event.target.value as FilterOutput["sort"];
                });
              }}
              value={data.sort}
            >
              {sortOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>inStock — p.boolean().optional(), absent = any</span>
            <select
              onChange={(event) => {
                apply((draft) => {
                  if (event.target.value === "any") delete draft.inStock;
                  else draft.inStock = event.target.value === "true";
                });
              }}
              value={data.inStock === undefined ? "any" : String(data.inStock)}
            >
              <option value="any">any</option>
              <option value="true">in stock</option>
              <option value="false">out of stock</option>
            </select>
          </label>
          <div className="checks">
            {allTags.map((tag) => (
              <label key={tag}>
                <input
                  checked={data.tags.includes(tag)}
                  onChange={(event) => {
                    apply((draft) => {
                      // S6: unchecking the last tag makes this [], and [] ≡
                      // absent — `tags` vanishes from the URL entirely.
                      draft.tags = event.target.checked
                        ? [...data.tags, tag]
                        : data.tags.filter((existing) => existing !== tag);
                    });
                  }}
                  type="checkbox"
                />
                {tag}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">
            {matches.length} match{matches.length === 1 ? "" : "es"} — page{" "}
            {page}/{pageCount}
          </p>
          <ul className="cards">
            {visible.map((product) => (
              <li className="card" key={product.id}>
                <span className="card__path">/products/{product.id}</span>
                <p>
                  {product.name} — ${product.price.toFixed(2)},{" "}
                  {product.inStock ? "in stock" : "out of stock"}
                </p>
                <div className="pills">
                  {product.tags.map((tag) => (
                    <span className="pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    // Imperative navigation: Href is a string subtype, so the
                    // branded value flows into router.push with no cast —
                    // <Link href={href(...)}> is the declarative twin.
                    router.push(
                      href(productsRoute, { params: { id: product.id } }),
                    );
                  }}
                  type="button"
                >
                  Open with router.push
                </button>
              </li>
            ))}
          </ul>
          <div className="pager">
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => {
                applyPage(page - 1);
              }}
              type="button"
            >
              ← Prev
            </button>
            <button
              className="btn"
              disabled={page >= pageCount}
              onClick={() => {
                applyPage(page + 1);
              }}
              type="button"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
      <p className="hint">
        Watch the URL bar: page=1, sort=name, and an empty tags list never
        appear — value-form defaults elide (D8) and [] ≡ absent (S6). Filter
        edits use replace (no history spam); Open uses push.
      </p>
    </section>
  );
}

// Decode output ≠ href input under exactOptionalPropertyTypes: useSearch
// hands back optional keys as `T | undefined` (always present), while
// href()'s search input wants absent keys actually absent. Conditional
// assignment bridges the two — a spread would not compile.
function toInput(data: FilterOutput): FilterInput {
  const input: FilterInput = {
    page: data.page,
    sort: data.sort,
    tags: data.tags,
  };
  if (data.inStock !== undefined) input.inStock = data.inStock;
  if (data.q !== undefined) input.q = data.q;
  return input;
}
