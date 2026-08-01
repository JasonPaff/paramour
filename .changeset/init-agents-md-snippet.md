---
"@paramour-js/next": minor
---

`paramour init` gains a sixth step: append a marker-delimited (`<!-- paramour:start -->` … `<!-- paramour:end -->`) paramour section to an existing `AGENTS.md` (or, failing that, `CLAUDE.md`), pointing agents at the installed skill and the generate/check/list verify loop. Append-only — init never creates the file (a root `AGENTS.md` is a skills-detection signal); re-runs refresh the section in place without touching surrounding prose; `--no-agents-md` opts out.
