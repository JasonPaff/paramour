// @vitest-environment happy-dom
import type { AnyCodec } from "paramour";

import { p } from "paramour";
import { codecShapeLabel } from "paramour/internal";
import { describe, expect, it } from "vitest";

import { previewDecode } from "../src/inference.js";

/**
 * Foreign throws from user schema/custom-codec code reach previewDecode's
 * catch UNWRAPPED (decodeSearch's deliberate taxonomy), including values
 * String() itself cannot stringify — the message rendering must use core's
 * hardened `foreignMessage`, or the panel crashes instead of showing an
 * error row.
 */
describe("previewDecode foreign-throw hardening", () => {
  it("renders an error row for an unstringifiable thrown value", () => {
    const evil = {
      "~standard": {
        validate: (): never => {
          // A null-prototype object has no usable primitive conversion:
          // String(thrown) throws a fresh TypeError.
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- throwing a non-Error is the point: user code can throw anything
          throw Object.create(null) as object;
        },
        vendor: "paramour-tests",
        version: 1 as const,
      },
    };
    const codec = p.json(evil);
    const result = previewDecode(codec, "k", "1");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(typeof result.issues[0]?.message).toBe("string");
    }
  });
});

/**
 * Drift guard: the `expected` label previewDecode synthesizes for a foreign
 * throw must be core's own label for the same codec in the same position —
 * a whole-codec search-position decode, so no forceMany (the codec's own
 * arity carries any `[]`), exactly as decodeSearch's issues render it. The
 * foreign-throwing json schema is the lever: it fails every codec that
 * embeds it, letting one probe walk scalar, csv, array, and the deepest
 * legal composite (array<csv<json>>).
 */
describe("previewDecode synthesized issue labels", () => {
  const throwing = {
    "~standard": {
      validate: (): never => {
        throw new Error("foreign failure");
      },
      vendor: "paramour-tests",
      version: 1 as const,
    },
  };

  const cases: readonly {
    readonly codec: AnyCodec;
    readonly draft: readonly string[] | string;
    readonly name: string;
  }[] = [
    { codec: p.json(throwing), draft: "1", name: "scalar json" },
    { codec: p.csv(p.json(throwing)), draft: "1", name: "csv<json>" },
    { codec: p.array(p.json(throwing)), draft: ["1"], name: "json[]" },
    {
      codec: p.array(p.csv(p.json(throwing))),
      draft: ["1"],
      name: "csv<json>[]",
    },
  ];

  for (const { codec, draft, name } of cases) {
    it(`matches core's codecShapeLabel for ${name}`, () => {
      const result = previewDecode(codec, "k", draft);
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.issues[0]?.expected).toBe(codecShapeLabel(codec));
      }
    });
  }

  it("renders the repeated form for an array codec (arity from the codec itself)", () => {
    const result = previewDecode(p.array(p.json(throwing)), "k", ["1"]);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.issues[0]?.expected).toBe("json[]");
    }
  });
});
