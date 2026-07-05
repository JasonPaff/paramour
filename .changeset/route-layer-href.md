---
"paramour": minor
---

Route-layer link building (design-03 block 3): `href()` with the branded `Href<Path>` return type (assignable to `string`, never from it — RL4), fixed path–query–fragment assembly with verbatim hash emission (S10), and the `InferHrefInput` options type with presence-driven optionality on both halves — `params` and `search` (and the whole options argument) are omittable exactly when no key is required, so `href(docsRoute)` works for optional-catch-all-only routes. Also adds fast-check round-trip property tests pinning the wire-format §6 contract and a second tstyche target exercising post-generation registry behavior through a `declare module "paramour"` augmentation.
