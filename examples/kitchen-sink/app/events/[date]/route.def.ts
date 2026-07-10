import { defineAppRoute, p } from "paramour";

import { csvList } from "../../../lib/codecs";
import { coords } from "../../../lib/schemas";

// Date/time, JSON, and custom codecs, plus the FACTORY forms of the modifiers.
export const eventsRoute = defineAppRoute("/events/[date]", {
  params: {
    // p.isoDate — strict YYYY-MM-DD, round-trip validated (rejects Feb 30),
    // decodes to a Date. Its href-input type is therefore a Date, not a string.
    date: p.isoDate(),
  },
  search: {
    // p.timestamp — strict ISO 8601 UTC instant (offsets rejected), optional.
    at: p.timestamp().optional(),
    // p.integer with a FACTORY .default(): invoked fresh per decode and NEVER
    // elided (a time-varying factory must not silently drop an explicit value).
    attempts: p.integer().default(() => 0),
    // p.json refined by a Zod schema: JSON.parse then validate, both ways.
    coords: p.json(coords).optional(),
    // p.custom (the CSV codec) with a FACTORY .catch() then .optional(): a
    // malformed value recovers to a fresh []; an absent key stays undefined.
    ref: csvList.catch((): string[] => []).optional(),
  },
});
