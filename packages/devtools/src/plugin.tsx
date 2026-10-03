import type { ReactElement } from "react";

import { ParamourDevtoolsPanel } from "./components/panel.js";

/**
 * The TanStack Devtools plugin entry: the user owns the shell — install
 * `@tanstack/react-devtools`, mount
 * `<TanStackDevtools plugins={[paramourDevtoolsPlugin()]} />`, done. The
 * entry type is declared STRUCTURALLY (the shell's contract is just
 * name/render/id/defaultOpen) so this module never imports the shell at
 * runtime; assignability to the real plugin type is certified by the
 * package's type tests.
 *
 * `render` is a function because that is the only way the panel receives
 * the shell's theme: the shell calls a function render as
 * `render(el, { theme, devtoolsOpen })` whenever its theme changes, and
 * renders an element as-is with no props injected.
 */
export interface ParamourDevtoolsPluginEntry {
  readonly defaultOpen?: boolean;
  readonly id: string;
  readonly name: string;
  readonly render: (
    el: HTMLElement,
    props: { readonly theme: "dark" | "light" },
  ) => ReactElement;
}

export interface ParamourDevtoolsPluginOptions {
  readonly defaultOpen?: boolean;
}

export function paramourDevtoolsPlugin(
  options?: ParamourDevtoolsPluginOptions,
): ParamourDevtoolsPluginEntry {
  return {
    ...(options?.defaultOpen === undefined
      ? {}
      : { defaultOpen: options.defaultOpen }),
    id: "paramour-devtools",
    name: "Paramour",
    render: (_el, { theme }) => <ParamourDevtoolsPanel theme={theme} />,
  };
}
