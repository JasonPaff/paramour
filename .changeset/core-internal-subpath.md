---
"paramour": minor
---

Move `parseValue` and `foreignMessage` off the main barrel to a new `paramour/internal` entry point. Both exist for derived tooling (reflection-driven probes, error-message hardening), not app authors; the new subpath is explicitly unstable and outside the documented public API.
