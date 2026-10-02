---
"@paramour-js/next": patch
---

`paramour init` keeps the line endings of the files it edits. In a CRLF checkout (git `core.autocrlf=true`), it used to report "updated paramour section" for an unchanged `AGENTS.md`/`CLAUDE.md` section and leave the file with mixed CRLF and LF line endings. It also rewrote a CRLF `package.json` or `next.config` entirely in LF. It now recognizes its own section regardless of line endings, and writes each edit using the file's existing line ending. Wrapping `next.config` also no longer drops the file's final newline.
