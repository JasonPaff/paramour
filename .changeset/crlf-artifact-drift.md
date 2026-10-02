---
"@paramour-js/next": patch
---

Line endings are no longer drift. `withTypedRoutes({ strict: true })` and `paramour check` compared `paramour-env.d.ts` byte for byte, so a Windows checkout with `core.autocrlf=true` (CRLF on disk, LF generated) failed every strict build and every `check`, and the no-op regeneration left the file modified in `git status`. Both now compare with CRLF and LF treated as equal, and a file that differs only in line endings is left untouched.
