// @vitest-environment happy-dom
import { p } from "paramour";
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
