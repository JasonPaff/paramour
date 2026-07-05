---
"@paramour-js/next": minor
---

Typed-routes codegen foundations (design-05 block 1): the TR2 filesystem scanner (`scanRoutes`, `resolveAppDir`, `DEFAULT_PAGE_EXTENSIONS`) and the TR3 artifact emitter (`emitArtifact`, `writeIfChanged`). Scanner output is the sorted, deduped union of URL-shaped route paths (groups stripped, slots/interception/private subtrees skipped, dynamic segments verbatim); emitter output is deterministic LF-only text whose empty case preserves the world-A `string` fallback, written via byte-compare write-if-changed. A world A/B compiler-API integration test proves the generated `paramour-env.d.ts` flips `defineRoute` literal verification on.
