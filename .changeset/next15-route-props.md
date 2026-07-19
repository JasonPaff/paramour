---
"paramour": minor
---

`RouteProps`, `ParamsProps`, and `SearchProps` are now promise-only, so a
page typed `props: RouteProps` passes Next 15.5's generated `.next/types`
page check (`params` must be `Promise<any> | undefined`) instead of failing
`next build`. The parse surface stays lenient: `parse`/`safeParse`/
`parseParams`/`parseSearch` now accept the new `RoutePropsInput` /
`ParamsPropsInput` / `SearchPropsInput` types, which keep admitting plain
sync objects (tests, server code). Breaking only for code that annotated
sync props with the old types — annotate with the `*Input` types instead.
