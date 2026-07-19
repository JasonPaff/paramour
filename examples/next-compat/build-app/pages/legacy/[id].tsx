import { useRouteParams, useSearch } from "@paramour-js/next/pages";

import { legacyRoute } from "../../routes";

/**
 * The Pages Router build gate: importing `@paramour-js/next/pages` from a
 * `pages/` route makes Next's "Collecting page data" phase load the package
 * server-side. On Next 15 that load is Node ESM resolution of the package as
 * an external — an extensionless deep import like `next/router` (no root
 * stub match) dies there with ERR_MODULE_NOT_FOUND, which the type layer and
 * a bundled build can never see. (Next 16 tolerates it, which is how the bug
 * originally shipped.)
 */
export default function LegacyPage() {
  const params = useRouteParams(legacyRoute);
  const search = useSearch(legacyRoute);
  if (params.status !== "success") return <main>…</main>;
  return (
    <main>
      <h1>Legacy #{params.data.id}</h1>
      <p>{search.status === "success" ? (search.data.q ?? "no q") : "…"}</p>
    </main>
  );
}
