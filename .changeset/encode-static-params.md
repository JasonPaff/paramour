---
"paramour": minor
---

New `encodeStaticParams(route, params)` — the static-generation twin of `encodeParams`. Returns the per-param record of codec-serialized wire values that App Router `generateStaticParams` entries and Pages Router `getStaticPaths` `{ params }` objects expect (`{ photoId: "42" }`, catch-alls as `string[]`). Values are NOT percent-encoded — Next percent-encodes static-params values itself, so pre-encoding would double-encode — static segments are skipped, and an elided optional catch-all OMITS its key (the R3 base-path variant on both routers). Shares `encodeParams`' R1–R4 validation: a missing required param, a non-array catch-all, an empty required catch-all, or an empty-string segment is a `SerializeError` at build time. The return type, `InferStaticParams<R>`, is mapped per segment kind (`[id]` → `string`, `[...seg]` → `string[]`, `[[...slug]]` → optional `string[]`) and assignable to what both static surfaces accept.
