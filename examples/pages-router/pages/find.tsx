import { useSearch } from "@paramour-js/next/pages";

import { FindForm } from "../components/find-form";
import { findRoute } from "../lib/routes";

// No data fetching, so Next statically optimizes this page: the first client
// render has isReady === false and an EMPTY query even when the URL visibly
// carries one. That platform fact is why the pages hooks are three-state
// (PR5) — the pending arm below actually renders for a moment on a hard
// load, then flips to data. There are deliberately no OrThrow variants
// (PR6): throwing here would flash the error boundary on every hard load.
export default function FindPage() {
  const search = useSearch(findRoute);

  return (
    <main>
      <h1>Find</h1>
      <p className="lede">
        A statically-optimized page reading its search params with{" "}
        <code>useSearch</code>. On a hard load the router starts{" "}
        <code>pending</code>; try{" "}
        <code>/find?q=cable&amp;tag=audio&amp;tag=usb&amp;max=5</code>, and{" "}
        <code>/find?max=not-a-number</code> for the error arm. Or edit the form
        below — it replaces the URL with <code>router.replace(href(...))</code>{" "}
        and the hook re-decodes it.
      </p>

      {search.status === "pending" ? (
        <p className="eyebrow">waiting for the router…</p>
      ) : search.status === "error" ? (
        <ul className="issues">
          {search.error.issues.map((issue) => (
            <li key={issue.key}>
              <code>{issue.key}</code>: {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <dl className="kv">
            <dt>
              <code>search.q</code> — <code>p.string().optional()</code>
            </dt>
            <dd>{search.data.q ?? "(absent)"}</dd>
            <dt>
              <code>search.tag</code> — <code>p.stringArray()</code>
            </dt>
            <dd>
              {search.data.tag.length > 0
                ? search.data.tag.join(", ")
                : "(absent decodes to [])"}
            </dd>
            <dt>
              <code>search.max</code> — <code>p.integer().optional()</code>
            </dt>
            <dd>{search.data.max ?? "(absent)"}</dd>
          </dl>
          {/* Keyed on the decoded values so back/forward remounts the
              uncontrolled inputs with the URL's state. */}
          <FindForm
            current={search.data}
            key={`${search.data.q ?? ""}|${String(search.data.max)}`}
          />
        </>
      )}
    </main>
  );
}
