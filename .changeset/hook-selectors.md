---
"@paramour-js/next": minor
---

Read hooks gain TanStack-style selectors and raw-slice stabilization (design-07).

**Selectors (all six read hooks):** `useSearch`, `useSearchOrThrow`, `useRouteParams`, and `useRouteParamsOrThrow` (app) plus `useSearch` and `useRouteParams` (pages) now take an optional second argument `{ select, equality? }`. `select` projects the decoded value — safe hooks return `SafeResult<U>` (pages: `RouterResult<U>`) with the error/pending arms passing through untouched; `*OrThrow` hooks return the bare selection. Result equality is `Object.is` by default with a one-level `equality: "shallow"` opt-in, so an unchanged selection keeps its previous reference (wrapper included) when other params change — memoized children, effect deps, and query keys downstream stop churning. Selector throws propagate to the error boundary (a selector bug is a code bug, not URL data), and selector identity is never compared, so inline arrows are fine.

**Raw-slice stabilization (all hooks, selector or not):** results are now keyed on the _declared slice_ of the raw source — the route's declared search keys' wire values / its dynamic segment names' values — instead of Next's object reference. A URL change that only touches keys the route doesn't own (`?utm_source=` churn) returns the previous result by identity without re-decoding, and the error arm is stabilized the same way. `rawSearch` routes fingerprint every key (their schema legitimately sees all of them), pages routes additionally exclude their own path params. Breaking (behavioral): a fresh `URLSearchParams`/`query` object with an identical declared slice now returns the _identical_ result object, where it previously produced a fresh equal one.

Honest framing: Next owns the subscription, so components calling these hooks still re-render on any URL change — selectors stabilize _slices_, they cannot skip renders (unlike TanStack Router, which owns its store).
