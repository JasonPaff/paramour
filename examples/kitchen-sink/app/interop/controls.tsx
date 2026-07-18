"use client";

import { useQueryStates } from "nuqs";

import { interopParsers } from "./search-params";

const ALL_LABELS = ["blue", "green", "red"];
const ALL_TAGS = ["audio", "cable", "video"];

// nuqs client state over parsers derived from the route (NQ12). Note what is
// ABSENT here compared to a hand-rolled bridge: no createParser wrappers, no
// restated .withDefault(1), no hand-written eq for the Date or the arrays —
// equality is the codec's own wire form (NQ4), so clearOnDefault agrees with
// paramour's D8 elision by construction.
export function Controls() {
  const [search, setSearch] = useQueryStates(interopParsers);

  return (
    <section className="panel">
      <h2>Client state — useQueryStates(interopParsers)</h2>
      <div className="split">
        <div>
          <label className="field">
            <span>q — optional, null clears the key</span>
            <input
              onChange={(event) => {
                void setSearch({
                  q: event.target.value === "" ? null : event.target.value,
                });
              }}
              placeholder="type to write the URL"
              value={search.q ?? ""}
            />
          </label>
          <label className="field">
            <span>
              since — p.isoDate(): a Date value, day-granular wire form
            </span>
            <input
              onChange={(event) => {
                void setSearch({
                  since:
                    event.target.value === ""
                      ? null
                      : new Date(event.target.value),
                });
              }}
              type="date"
              value={
                search.since === null
                  ? ""
                  : search.since.toISOString().slice(0, 10)
              }
            />
          </label>
          <div className="field">
            <span>
              page — .default(1): 1 clears the key (clearOnDefault ≡ D8)
            </span>
            <div className="pager">
              <button
                className="btn"
                disabled={search.page <= 1}
                onClick={() => {
                  void setSearch({ page: search.page - 1 });
                }}
                type="button"
              >
                ← Prev
              </button>
              <span> page {search.page} </span>
              <button
                className="btn"
                onClick={() => {
                  void setSearch({ page: search.page + 1 });
                }}
                type="button"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
        <div>
          <div className="field">
            <span>labels — p.csv(): ONE wire value, comma-separated</span>
            <div className="checks">
              {ALL_LABELS.map((label) => (
                <label key={label}>
                  <input
                    checked={search.labels.includes(label)}
                    onChange={(event) => {
                      void setSearch({
                        labels: event.target.checked
                          ? [...search.labels, label]
                          : search.labels.filter(
                              (existing) => existing !== label,
                            ),
                      });
                    }}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <span>
              tags — p.stringArray(): repeated keys (?tags=a&amp;tags=b)
            </span>
            <div className="checks">
              {ALL_TAGS.map((tag) => (
                <label key={tag}>
                  <input
                    checked={search.tags.includes(tag)}
                    onChange={(event) => {
                      void setSearch({
                        tags: event.target.checked
                          ? [...search.tags, tag]
                          : search.tags.filter((existing) => existing !== tag),
                      });
                    }}
                    type="checkbox"
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="hint">
        Watch the URL bar: labels pack into one key, tags repeat theirs, and
        page=1 / an empty list never appear — then reload, and the server panel
        above re-reads the exact same URL through the route contract.
      </p>
    </section>
  );
}
