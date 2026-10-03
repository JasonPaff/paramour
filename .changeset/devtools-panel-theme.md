---
"@paramour-js/devtools-panel": major
---

The devtools panel now follows the TanStack Devtools theme. Before this fix it always rendered light, even in a dark shell. The shell passes its theme only to a plugin's `render` function and renders an element `render` as-is, so `paramourDevtoolsPlugin()` now returns `render` as `(el, { theme }) => <ParamourDevtoolsPanel theme={theme} />`.

**Breaking (types):** `ParamourDevtoolsPluginEntry.render` changes from `ReactElement` to `(el: HTMLElement, props: { readonly theme: "dark" | "light" }) => ReactElement`. Passing the entry to `<TanStackDevtools plugins={[paramourDevtoolsPlugin()]} />` is unchanged. Only code that reads `entry.render` as an element needs updating. Call it with the shell's theme or render `<ParamourDevtoolsPanel theme={…} />` directly.
