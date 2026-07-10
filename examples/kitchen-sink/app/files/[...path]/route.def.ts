import { defineAppRoute, p } from "paramour";

// A REQUIRED catch-all: unlike [[...slug]], `path` must have at least one
// segment — a present-but-empty array is a serialization error, and an absent
// source is a decode issue. Decodes to a string[].
export const filesRoute = defineAppRoute("/files/[...path]", {
  params: { path: p.string() },
});
