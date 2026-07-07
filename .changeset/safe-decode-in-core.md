---
"paramour": minor
"@paramour-js/next": patch
---

`safeDecodeParams` / `safeDecodeSearch` move to core and become public API. They were previously private modules inside `@paramour-js/next` that the client hooks used internally — unreachable by consumers (the package's `exports` map never exposed them). They are framework-agnostic sync `SafeResult` wrappers over core's own `decodeParams`/`decodeSearch`, so they now live beside the throwing versions and are exported from `paramour`, along with the `ParamsSource` type. `@paramour-js/next`'s hooks import them from core; its public surface is unchanged.
