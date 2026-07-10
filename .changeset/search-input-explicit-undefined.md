---
"paramour": minor
---

`InferSearchInput` (and therefore `href`'s / `encodeSearch`'s search input) now admits an explicit `undefined` on omittable keys — optional, defaulted, and arity-"many". The runtime has always treated an explicit `undefined` value as absence (the key is omitted from the wire, S3); only the type rejected it, which under `exactOptionalPropertyTypes` forced key-by-key conditional reassembly when flowing a decoded search object back into `href` (middleware canonicalization, form round-trips). A decoded `InferSearchOutput` is now directly assignable to the matching `InferSearchInput`. Required keys still reject `undefined` at the type level, matching the runtime `SerializeError`.
