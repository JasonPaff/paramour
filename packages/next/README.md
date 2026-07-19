# @paramour-js/next

The Next.js integration for [paramour](https://paramour.dev):
`withTypedRoutes` (build-time registry generation and drift checking),
typed client hooks for both routers, and the `paramour` CLI
(`generate` / `check` / `init` / `list` / `doctor`).

```sh
pnpm add paramour @paramour-js/next
```

Wrap your Next config so the route registry regenerates on dev and is
enforced on build:

```ts
// next.config.ts
import { withTypedRoutes } from "@paramour-js/next";

export default withTypedRoutes({}, { strict: true });
```

Client components read the URL through hooks that take the same route
object as everything else:

```tsx
"use client";

import { useSearch } from "@paramour-js/next/app";

import { productRoute } from "./route.def";

export function FilterSummary() {
  const search = useSearch(productRoute);
  if (search.status === "error") return <p role="alert">Bad filters</p>;
  return <p>query: {search.data.q ?? "none"}</p>;
}
```

## Docs

- [Getting started](https://paramour.dev/docs/getting-started)
- [Next API reference](https://paramour.dev/docs/reference/next)
- [CLI reference](https://paramour.dev/docs/reference/next/cli)
- [Hooks guide](https://paramour.dev/docs/guides/hooks)

## License

MIT © Jason Paff
