import { defineAppRoute, p, type SearchConfig } from "paramour";

import { explorerStateSchema, STARTER_STATE } from "./descriptor";

// The explorer's own state is a paramour search config — the DS6 dogfood
// (plan-docs-milestone-5 B1). The full state (composed config descriptor,
// encode inputs, decode query) rides in one p.json param whose value-form
// .default() supplies the starter example AND elides it (D8): the pristine
// explorer is plain /explorer. The active pane is a defaulted p.enum, so
// only the decode pane marks the URL.
export const explorerSearch = {
  config: p.json(explorerStateSchema).default(STARTER_STATE),
  pane: p.enum(["encode", "decode"]).default("encode"),
} satisfies SearchConfig;

export const explorerRoute = defineAppRoute("/explorer", {
  search: explorerSearch,
});
