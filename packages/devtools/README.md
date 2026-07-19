# @paramour-js/devtools

A [TanStack Devtools](https://tanstack.com/devtools) panel for
[paramour](https://paramour.dev): watch your routes decode in real time.
Every hook call reports what it saw — which route, the raw wire values, the
decoded result, or the exact `issues[]` when a decode failed — with
defaults and `.catch()` recoveries attributed rather than silently blended
in, and editable search inputs that navigate the app to the URL you
compose.

```sh
pnpm add @paramour-js/devtools @tanstack/react-devtools
```

You own the TanStack shell; paramour is a plugin in it. Mount it once,
dev-conditionally:

```tsx
"use client";

import { paramourDevtoolsPlugin } from "@paramour-js/devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

export function Devtools() {
  if (process.env.NODE_ENV === "production") return null;
  return <TanStackDevtools plugins={[paramourDevtoolsPlugin()]} />;
}
```

## Docs

- [Devtools guide](https://paramour.dev/docs/guides/devtools)
- [Devtools API reference](https://paramour.dev/docs/reference/devtools)

## License

MIT © Jason Paff
