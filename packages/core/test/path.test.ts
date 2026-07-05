import { describe, expect, it } from "vitest";

import {
  buildPath,
  decodeParams,
  defineRoute,
  encodeParams,
  p,
  ParamourError,
  ParamsDecodeError,
  SerializeError,
} from "../src";

describe("encodeParams / buildPath (RL5)", () => {
  it("R1: a single param is serialized, encoded, and substituted", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    expect(encodeParams(route, { id: 42 })).toEqual(["product", "42"]);
    expect(buildPath(route, { id: 42 })).toBe("/product/42");
  });

  it("R1: segment values are percent-encoded (%20 for space, %2F for /)", () => {
    const route = defineRoute("/tag/[name]", { params: { name: p.string() } });
    expect(buildPath(route, { name: "a b/c" })).toBe("/tag/a%20b%2Fc");
  });

  it("static segments are emitted verbatim, never re-encoded (RL2)", () => {
    const route = defineRoute("/über/[id]", { params: { id: p.string() } });
    expect(buildPath(route, { id: "x" })).toBe("/über/x");
  });

  it("R2: catch-all elements are encoded independently and joined with /", () => {
    const route = defineRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(encodeParams(route, { seg: ["a", "b c", "d/e"] })).toEqual([
      "files",
      "a",
      "b%20c",
      "d%2Fe",
    ]);
    expect(buildPath(route, { seg: ["a", "b c", "d/e"] })).toBe(
      "/files/a/b%20c/d%2Fe",
    );
  });

  it("R3: a required catch-all given [] is a SerializeError", () => {
    const route = defineRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(() => buildPath(route, { seg: [] })).toThrow(SerializeError);
    expect(() => buildPath(route, { seg: [] })).toThrow(/empty array/);
  });

  it("R3: an optional catch-all given [] or absent vanishes with its slash", () => {
    const route = defineRoute("/docs/[[...slug]]", {
      params: { path: p.string() },
    });
    expect(buildPath(route, {})).toBe("/docs");
    expect(buildPath(route, { path: [] })).toBe("/docs");
    expect(buildPath(route, { path: ["a", "b"] })).toBe("/docs/a/b");
  });

  it("R3: a fully-elided root optional catch-all yields /", () => {
    const route = defineRoute("/[[...all]]", { params: { all: p.string() } });
    expect(buildPath(route, {})).toBe("/");
  });

  it('R4: "" as a segment value or catch-all element is a SerializeError', () => {
    const single = defineRoute("/user/[id]", { params: { id: p.string() } });
    expect(() => buildPath(single, { id: "" })).toThrow(SerializeError);
    const catchAll = defineRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(() => buildPath(catchAll, { seg: ["a", ""] })).toThrow(
      SerializeError,
    );
  });

  it("a serializer returning a non-string is a SerializeError, not literal text", () => {
    const sneaky = p.custom<string>({
      parse: (raw) => raw,
      serialize: () => undefined as unknown as string,
    });
    const route = defineRoute("/x/[id]", { params: { id: sneaky } });
    expect(() => buildPath(route, { id: "v" })).toThrow(SerializeError);
    expect(() => buildPath(route, { id: "v" })).toThrow(/must return a string/);
  });

  it("a missing required param is a SerializeError", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    expect(() => buildPath(route, {} as never)).toThrow(SerializeError);
    expect(() => buildPath(route, {} as never)).toThrow(/is missing/);
    const catchAll = defineRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(() => buildPath(catchAll, {} as never)).toThrow(/is missing/);
  });

  it("a non-array for a catch-all is a SerializeError", () => {
    const route = defineRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(() => buildPath(route, { seg: "a" } as never)).toThrow(
      /expects an array/,
    );
  });

  it("a non-object params input fails loud", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    expect(() => encodeParams(route, null as never)).toThrow(SerializeError);
    expect(() => encodeParams(route, null as never)).toThrow(
      /must be an object/,
    );
  });

  it("a lone surrogate in a segment value is branded (S7)", () => {
    const route = defineRoute("/x/[id]", { params: { id: p.string() } });
    expect(() => buildPath(route, { id: "\uD800" })).toThrow(SerializeError);
  });

  it("a missing codec for a dynamic segment is a loud ParamourError", () => {
    const route = defineRoute("/x/[id]", {} as never);
    expect(() => buildPath(route, { id: "1" })).toThrow(/declares no codec/);
  });

  it("a hand-built route lacking ~params entirely fails the same way", () => {
    const route = { path: "/x/[id]" } as never;
    expect(() => buildPath(route, { id: "1" })).toThrow(/declares no codec/);
    expect(() => decodeParams(route, { id: "1" })).toThrow(/declares no codec/);
  });
});

describe("decodeParams (RL7)", () => {
  it("decodes singles per codec grammar; unknown keys are ignored", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    // Next includes parent-layout params; they are never read.
    expect(decodeParams(route, { id: "42", parentId: "junk" })).toEqual({
      id: 42,
    });
  });

  it("decodes catch-alls element-wise (D6)", () => {
    const route = defineRoute("/blog/[...slug]", {
      params: { slug: p.string() },
    });
    expect(decodeParams(route, { slug: ["a", "b"] })).toEqual({
      slug: ["a", "b"],
    });
  });

  it("an absent optional catch-all normalizes to [] (D6)", () => {
    const route = defineRoute("/docs/[[...slug]]", {
      params: { path: p.string() },
    });
    expect(decodeParams(route, {})).toEqual({ path: [] });
  });

  it("a static route decodes to {} whatever the source contains", () => {
    const route = defineRoute("/about", {});
    expect(decodeParams(route, { anything: "x" })).toEqual({});
  });

  it("a missing required key is an issue, and .catch() cannot recover it", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer().catch(0) },
    });
    expect(() => decodeParams(route, {})).toThrow(ParamsDecodeError);
    expect(() => decodeParams(route, {})).toThrow(
      /required route param is missing/,
    );
  });

  it("[id] given an array is a shape issue, not catchable (RL7)", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer().catch(0) },
    });
    expect(() => decodeParams(route, { id: ["1", "2"] })).toThrow(
      ParamsDecodeError,
    );
    expect(() => decodeParams(route, { id: ["1", "2"] })).toThrow(
      /expected a single segment value/,
    );
  });

  it("a catch-all given a string is a shape issue, not catchable (RL7)", () => {
    const route = defineRoute("/files/[...seg]", {
      params: { seg: p.string().catch("x") },
    });
    expect(() => decodeParams(route, { seg: "a" })).toThrow(ParamsDecodeError);
    expect(() => decodeParams(route, { seg: "a" })).toThrow(
      /expected catch-all values/,
    );
  });

  it("a non-string element is a shape issue with its index (RL7)", () => {
    const route = defineRoute("/files/[...seg]", {
      params: { seg: p.string().catch("x") },
    });
    expect(() =>
      decodeParams(route, { seg: ["a", 1] as unknown as string[] }),
    ).toThrow(/element 1: expected a string/);
  });

  it("a present-but-empty required catch-all is an issue (mirrors R3)", () => {
    const route = defineRoute("/files/[...seg]", {
      params: { seg: p.string() },
    });
    expect(() => decodeParams(route, { seg: [] })).toThrow(ParamsDecodeError);
    expect(() => decodeParams(route, { seg: [] })).toThrow(
      /received no segment values/,
    );
  });

  it(".catch() recovers a single param per key", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer().catch(7) },
    });
    expect(decodeParams(route, { id: "nope" })).toEqual({ id: 7 });
  });

  it(".catch() recovers catch-all elements ELEMENT-WISE (RL7)", () => {
    const route = defineRoute("/files/[...n]", {
      params: { n: p.integer().catch(0) },
    });
    expect(decodeParams(route, { n: ["1", "x", "3"] })).toEqual({
      n: [1, 0, 3],
    });
  });

  it("an uncaught element failure is an issue carrying its index", () => {
    const route = defineRoute("/files/[...n]", {
      params: { n: p.integer() },
    });
    expect(() => decodeParams(route, { n: ["1", "x", "3"] })).toThrow(
      ParamsDecodeError,
    );
    expect(() => decodeParams(route, { n: ["1", "x", "3"] })).toThrow(
      /element 1:/,
    );
  });

  it("aggregates issues across keys like decodeSearch", () => {
    const route = defineRoute("/org/[orgId]/repo/[repoId]", {
      params: { orgId: p.integer(), repoId: p.integer() },
    });
    let caught: unknown;
    try {
      decodeParams(route, { orgId: "x", repoId: "y" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParamsDecodeError);
    expect((caught as ParamsDecodeError).issues).toHaveLength(2);
    expect((caught as ParamsDecodeError).issues.map((i) => i.key)).toEqual([
      "orgId",
      "repoId",
    ]);
  });

  it("a non-object source fails loud, not as a decode issue", () => {
    const route = defineRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    expect(() => decodeParams(route, null as never)).toThrow(ParamourError);
    expect(() => decodeParams(route, null as never)).not.toThrow(
      ParamsDecodeError,
    );
  });

  it("a missing codec for a dynamic segment is a loud ParamourError", () => {
    const route = defineRoute("/x/[id]", {} as never);
    expect(() => decodeParams(route, { id: "1" })).toThrow(/declares no codec/);
  });
});
