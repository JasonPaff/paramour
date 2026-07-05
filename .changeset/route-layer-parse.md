---
"paramour": minor
---

Route-layer parse runtime (design-03 block 2): path serialization and decoding per the wire-format R-rules — `encodeParams`/`buildPath` (R1–R4: percent-encoded segments, element-wise catch-alls, optional-catch-all elision, loud `SerializeError`s for `[]`/`""`) and `decodeParams` (RL7: strict shape validation as aggregated issues, element-wise `.catch()` recovery for catch-alls) — plus the six parse methods on route objects (`parse`/`safeParse`, `parseParams`/`safeParseParams`, `parseSearch`/`safeParseSearch`) with structural `RouteProps`/`ParamsProps`/`SearchProps`, the data-xor-error `SafeResult`, and params-before-search error precedence. Conformance cases C16/C17 are now live.
