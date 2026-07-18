/**
 * `@paramour-js/devtools` — a TanStack Devtools panel for paramour routes
 * (design-12). The public surface is deliberately tiny: the panel component
 * and the plugin-entry helper. The observation seam's types stay internal —
 * their contract of record is `@paramour-js/next/devtools-seam`.
 */
export {
  ParamourDevtoolsPanel,
  type ParamourDevtoolsPanelProps,
} from "./components/panel.js";
export {
  paramourDevtoolsPlugin,
  type ParamourDevtoolsPluginEntry,
  type ParamourDevtoolsPluginOptions,
} from "./plugin.js";
