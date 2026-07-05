---
"paramour": patch
---

Two `href()` hardening fixes from review. Type level: an options half whose input has no keys (static route → `params`, no search config → `search`) is now banned outright (`?: never`, mirroring `RouteConfig`'s static-path stance) — previously it typed as `Partial<Record<Key, {}>>`, which is exempt from excess-property checking, so junk `params`/`search` objects compiled and were silently dropped from the link. Runtime: hand-built route objects missing `~search` or `~params` now fail with branded `ParamourError`s at the `encodeSearch`/`decodeSearch` config guards and `requireCodec`, instead of leaking raw `TypeError`s.
