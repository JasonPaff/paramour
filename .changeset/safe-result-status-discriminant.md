---
"paramour": minor
"@paramour-js/next": minor
---

**Breaking:** `SafeResult<T>` now discriminates on a `status` field — `{ status: "success"; data: T } | { status: "error"; error: RouteDecodeError }` — replacing the previous data-xor-error shape (`{ data } | { error }`). Narrow with `result.status === "error"` instead of `if (result.error)`. Affects every safe surface: `safeParse` / `safeParseParams` / `safeParseSearch`, `safeDecodeParams` / `safeDecodeSearch`, and the `useRouteParams` / `useSearch` client hooks. This unifies the shape with the upcoming Pages Router hooks' three-state `RouterResult`, which extends the same union with a `{ status: "pending" }` member (design-06 PR12).
