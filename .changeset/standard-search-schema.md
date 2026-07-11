---
"paramour": minor
---

Add `standardSearchSchema(route)` (and the `StandardSearchSchema` type): exports a route's `search:` config as a spec-compliant Standard Schema, so the same route definition can validate tRPC inputs, server-action payloads, or TanStack Router `validateSearch`.

The schema is the URL wire contract, verbatim. Two things to know up front:

- **No coercion, ever.** It accepts wire strings (`{ page: "2" }`), not decoded values (`{ page: 2 }`) — the inferred input type (`Record<string, string | string[] | undefined>`) enforces this at compile time, and decoded values are rejected with issues at runtime. TanStack Router users need a string-preserving `parseSearch`.
- **`.catch()` semantics are exported too.** On a `.catch()` codec, invalid API input silently coerces to the fallback instead of erroring — byte-identical to URL decode, which is the point: one semantics for every consumer.

Defaults apply, unknown keys strip silently, and duplicate values on a scalar codec reject — exactly as `decodeSearch` behaves. `rawSearch` routes are supported (input is the raw wire record; output is the inner schema's output). Contract-violating input (non-objects, non-string values) becomes issues rather than thrown errors at this one boundary; async raw schemas and malformed configs still throw.

Also adds `SearchSourceError` (a `ParamourError` subclass, exported): `decodeSearch`/`safeDecodeSearch` now throw it for source-shape violations — a non-object source or a non-string value under a read key — instead of a bare `ParamourError`. Messages are unchanged, and `instanceof ParamourError` still matches.
