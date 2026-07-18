import type { ReactElement } from "react";

import { ParamourDevtoolsPanel } from "./components/panel.js";

/**
 * The TanStack Devtools plugin entry (design-12 DT1/DT13): the user owns
 * the shell — install `@tanstack/react-devtools`, mount
 * `<TanStackDevtools plugins={[paramourDevtoolsPlugin()]} />`, done. The
 * entry type is declared STRUCTURALLY (the shell's contract is just
 * name/render/id/defaultOpen) so this module never imports the shell at
 * runtime; assignability to the real plugin type is certified by the
 * package's type tests. The shell clones `render` and injects `theme`.
 */
export interface ParamourDevtoolsPluginEntry {
  readonly defaultOpen?: boolean;
  readonly id: string;
  readonly name: string;
  readonly render: ReactElement;
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
    render: <ParamourDevtoolsPanel />,
  };
}
