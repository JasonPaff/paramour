import { useRouteParams } from "@paramour-js/next/pages";

import { legacyRoute } from "../../lib/legacy.def";

// The pages/ side exists so the registry carries a pagesRoutes union —
// cases/registry.ts needs both unions to demonstrate cross-router rejection.
export default function LegacyPage() {
  const params = useRouteParams(legacyRoute);

  return (
    <main>
      <h1>Legacy (Pages Router)</h1>
      {params.status === "pending" ? (
        <p>waiting for the router…</p>
      ) : params.status === "error" ? (
        <p role="alert">{params.error.message}</p>
      ) : (
        <p>Legacy #{params.data.id}</p>
      )}
    </main>
  );
}
