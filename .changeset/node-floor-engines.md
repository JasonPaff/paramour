---
"paramour": minor
"@paramour-js/next": minor
"@paramour-js/nuqs": minor
"@paramour-js/devtools": minor
---

Declare `engines.node: ">=22.12.0"` in every published package. Node 18 is EOL and was never executed by CI; the supported floor is now Node 22.12 (active LTS), and CI runs the runtime test suite on exactly that version.
