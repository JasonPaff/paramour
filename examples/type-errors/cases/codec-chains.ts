import { p } from "paramour";

// Codec type-state: illegal modifier chains collapse the method to `never`,
// so the second call fails to compile instead of failing at runtime.
// Mirrors packages/core/test/codec-api.tst.ts ("illegal chains").

// @expect-error TS2349 — .optional() may only be applied once
p.string().optional().optional();

// @expect-error TS2349 — .default() is not available after .optional()
p.string().optional().default("a");

// @expect-error TS2349 — array codecs reject .default(): absent already means []
p.stringArray().default(["a"]);

// @expect-error TS2349 — .catch() may only be applied once
p.integer().catch(0).catch(1);
