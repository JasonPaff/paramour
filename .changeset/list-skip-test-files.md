---
"@paramour-js/next": patch
---

The automatic route-definition scan in `paramour list` and `paramour doctor` no longer loads test files (`*.test.*`, `*.spec.*`, and files under `__tests__/`). A test that mentions `defineAppRoute` used to be evaluated outside its test runner, which ran its top-level `describe`/`it` calls and any setup side effects. Explicit `routeFiles` globs are unchanged and can still name test files.
