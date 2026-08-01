---
"@paramour-js/next": minor
---

Ship a bundled Agent Skills–format skill (`skills/paramour/`: SKILL.md router plus setup/migration/authoring/reference files) and a new `paramour skills` command that installs it into each detected agent tool's skills directory (`.agents/`, `.claude/`, `.codex/`, `.cursor/`, portable fallback), stamping installs with a `.paramour-skills.json` content-hash manifest so re-syncs never overwrite local edits without `--force`. `skills --check` verifies freshness for CI (exit 1 on missing/stale), `paramour doctor` gains a warn-level skills staleness check, and `paramour init` auto-installs skills when agent tooling is detected (`--no-skills` opts out).
