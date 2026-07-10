import { useRouter } from "next/router";
import { href, type InferSearchInput, type SearchOutputOf } from "paramour";
import type { FormEvent } from "react";

import { findRoute, findSearch } from "../lib/routes";

// The Pages Router half of imperative navigation: href() output feeds
// next/router's Url parameter directly — same branded string, different
// router. Submit-based on purpose (contrast with kitchen-sink's live,
// debounced replace on /products): uncontrolled inputs, one
// router.replace(href(...)) per submit, and the three-state hooks upstream
// re-decode whatever comes back.
export function FindForm({
  current,
}: {
  current: SearchOutputOf<typeof findSearch>;
}) {
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = form.get("q");
    const max = form.get("max");

    // Build the exact-optional input shape: absent keys stay absent, so an
    // emptied field disappears from the URL rather than serializing as "".
    // `tag` has no control here and carries through unchanged.
    const search: InferSearchInput<typeof findSearch> = { tag: current.tag };
    if (typeof q === "string" && q !== "") search.q = q;
    if (typeof max === "string" && max !== "") {
      // Guard the cast from the (string-typed) form field: a non-integer
      // would make p.integer throw a SerializeError inside href().
      const parsed = Number(max);
      if (Number.isSafeInteger(parsed)) search.max = parsed;
    }
    // Pages Router push/replace return promises; replace keeps history clean
    // for a filter edit.
    void router.replace(href(findRoute, { search }));
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Replace the URL</h2>
      <label className="field">
        <span>q — p.string().optional()</span>
        <input defaultValue={current.q ?? ""} name="q" placeholder="cable" />
      </label>
      <label className="field">
        <span>max — p.integer().optional()</span>
        <input
          defaultValue={current.max ?? ""}
          name="max"
          placeholder="5"
          type="number"
        />
      </label>
      <button className="btn" type="submit">
        router.replace(href(findRoute, {"{ search }"}))
      </button>
    </form>
  );
}
