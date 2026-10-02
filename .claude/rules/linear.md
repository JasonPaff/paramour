## Issue tracking (Linear)

Work is tracked in Linear: team **Paramour**, key **PAR** (issues `PAR-123`, projects `P-PAR-12`). Use the Linear MCP tools to read and update it.

- **Before starting work**, find the PAR issue for it, or create one if none exists. Move it to In Progress. Small fixes found mid-task get their own issue rather than riding along unrecorded.
- **Branches** use the issue's `gitBranchName` from Linear (for example `jasonpaff/par-123-short-title`).
- **PRs** keep Conventional Commit titles. Put `Fixes PAR-123` in the body to close the issue on merge (Linear's GitHub integration is installed), or `Part of PAR-123` when the issue spans several PRs.
- **Labels:** one `area: <package>` label per package or surface touched (`core`, `next`, `cli`, `nuqs`, `devtools`, `eslint-plugin`, `docs`, `examples`, `ci-release`). Add one type label: `Feature`, `Bug`, `Improvement` or `Chore`. `Design` marks work that needs a design round before code. `Breaking` marks a change to public API or the wire format.
- **Projects** group work by feature area or release. Each project's lifecycle is shown by its status (Backlog, Planned, In Progress, Completed, Canceled). `Paramour 1.0` is the release project; anything that is not on its list goes post-1.0.
- **Design docs** are Linear documents on their project, not files. The old design docs (design-07 to design-22) were moved into Linear on 2026-10-01. The gitignored `.claude/docs/` folder is a frozen archive plus scratch space for throwaway spikes. Code comments stay the record for implemented decisions (see CLAUDE.md). A design doc records the reasoning that came before the code.
- **When a PR merges**, the issue goes to Done. If it shipped in a release, add a `Shipped in <version>` line.
