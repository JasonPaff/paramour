---
"example-kitchen-sink": patch
---

Commit an installed copy of the bundled agent skill (`.agents/skills/paramour`, written by `paramour skills`) and gate it in CI with `paramour skills --check`, so editing the skill source in `packages/next/skills/` without re-syncing the example fails the build.
