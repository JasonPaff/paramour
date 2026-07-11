---
"paramour": patch
---

Route props promise rejections carrying a string `digest` now propagate unwrapped instead of being rebranded as `ParamourError`s. Next's control-flow errors (`DYNAMIC_SERVER_USAGE`, `NEXT_REDIRECT`, `NEXT_NOT_FOUND`, …) use that convention — the same one `unstable_rethrow` keys on — and Next itself rejects the `searchParams` promise with the dynamic-usage sentinel when a `generateStaticParams` page reads search params during prerender. Wrapping the sentinel hid the digest, turning a graceful bail-to-dynamic into a failed `next build`. Digest-less rejections keep the `ParamourError` brand as before.
