/**
 * Runtime tests for `standardSearchSchema`, the Standard Schema generate-OUT
 * adapter (design-08 STD1–STD9).
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AnyRoute } from "../src";

import {
  decodeSearch,
  defineAppRoute,
  p,
  ParamourError,
  rawSearch,
  standardSearchSchema,
} from "../src";

/** Mixed-presence config exercising default, optional, catch, and arity-many. */
const mixedRoute = defineAppRoute("/items", {
  search: {
    flag: p.boolean().catch(false),
    page: p.integer().default(1),
    q: p.string().optional(),
    tags: p.array(),
  },
});

function expectIssues<Out>(
  result: StandardSchemaV1.Result<Out>,
): readonly StandardSchemaV1.Issue[] {
  if (!result.issues) {
    throw new Error("expected issues, got a success result");
  }
  return result.issues;
}

function expectSuccess<Out>(result: StandardSchemaV1.Result<Out>): Out {
  if (result.issues) {
    throw new Error(
      `expected success, got issues: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.value;
}

/** The exported schema is sync by contract (D7); unwrap for assertions. */
function validateSync<Out>(
  schema: StandardSchemaV1<unknown, Out>,
  input: unknown,
): StandardSchemaV1.Result<Out> {
  const result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    throw new Error("expected a sync validate result");
  }
  return result;
}

describe("standardSearchSchema spec surface (STD1)", () => {
  it("returns a v1 schema with the paramour vendor and a validate function", () => {
    const schema = standardSearchSchema(mixedRoute);
    expect(schema["~standard"].version).toBe(1);
    expect(schema["~standard"].vendor).toBe("paramour");
    expect(typeof schema["~standard"].validate).toBe("function");
  });

  it("carries no runtime types key — the prop is type-level only", () => {
    const schema = standardSearchSchema(mixedRoute);
    expect("types" in schema["~standard"]).toBe(false);
  });

  it("success applies defaults and keeps optional keys present-as-undefined (D4)", () => {
    const schema = standardSearchSchema(mixedRoute);
    const value = expectSuccess(validateSync(schema, { flag: "true" }));
    expect(value).toEqual({ flag: true, page: 1, q: undefined, tags: [] });
    expect(Object.hasOwn(value, "q")).toBe(true);
  });

  it("the schema is reusable: independent results across validate calls", () => {
    const schema = standardSearchSchema(mixedRoute);
    const first = expectSuccess(
      validateSync(schema, { flag: "true", page: "3" }),
    );
    const second = expectSuccess(validateSync(schema, { flag: "false" }));
    expect(first).toEqual({ flag: true, page: 3, q: undefined, tags: [] });
    expect(second).toEqual({ flag: false, page: 1, q: undefined, tags: [] });
  });
});

describe("byte-identical decode semantics (STD6)", () => {
  it("full parity with decodeSearch on a mixed source", () => {
    const schema = standardSearchSchema(mixedRoute);
    const source = { flag: "true", page: "2", q: "hi", tags: ["a", "b"] };
    const value = expectSuccess(validateSync(schema, source));
    expect(value).toEqual(decodeSearch(mixedRoute["~search"], source));
  });

  it(".catch() recovers an invalid wire value to the fallback — the exported sharp edge", () => {
    const schema = standardSearchSchema(mixedRoute);
    const value = expectSuccess(validateSync(schema, { flag: "nope" }));
    expect(value.flag).toBe(false);
  });

  it("P8: unknown keys strip from the output", () => {
    const schema = standardSearchSchema(mixedRoute);
    const value = expectSuccess(
      validateSync(schema, { flag: "true", junk: "whatever" }),
    );
    expect(Object.hasOwn(value, "junk")).toBe(false);
  });

  it("P8: a malformed value under an UNKNOWN key is ignored, not an issue", () => {
    // Pins the declared-keys-only pre-check: junk under keys paramour
    // doesn't own must never fail the decode.
    const schema = standardSearchSchema(mixedRoute);
    const value = expectSuccess(
      validateSync(schema, { flag: "true", junk: 42, q: "hi" }),
    );
    expect(value).toEqual({ flag: true, page: 1, q: "hi", tags: [] });
  });

  it("P5: duplicate values on a scalar codec become a keyed issue", () => {
    const schema = standardSearchSchema(mixedRoute);
    const issues = expectIssues(
      validateSync(schema, { flag: "true", page: ["1", "2"] }),
    );
    expect(issues).toEqual([
      {
        message: expect.stringContaining("2 values") as string,
        path: ["page"],
      },
    ]);
  });

  it("aggregates one issue per failed key with per-key paths", () => {
    const route = defineAppRoute("/multi", {
      search: { flag: p.boolean(), page: p.integer() },
    });
    const schema = standardSearchSchema(route);
    const issues = expectIssues(validateSync(schema, { flag: "x", page: "y" }));
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual([["flag"], ["page"]]);
    for (const issue of issues) {
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  it("a missing required param is a mapped issue, not a throw", () => {
    const route = defineAppRoute("/req", { search: { q: p.string() } });
    const schema = standardSearchSchema(route);
    const issues = expectIssues(validateSync(schema, {}));
    expect(issues).toEqual([
      {
        message: expect.stringContaining("required") as string,
        path: ["q"],
      },
    ]);
  });

  it('a codec-map param literally named "<search>" keeps its keyed path', () => {
    // The <search> sentinel is a rawSearch-only convention; a codec map's
    // issues are always keyed, so the sentinel un-mapping must not fire here.
    const route = defineAppRoute("/odd", {
      search: { "<search>": p.integer() },
    });
    const schema = standardSearchSchema(route);
    const issues = expectIssues(validateSync(schema, { "<search>": "nope" }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["<search>"]);
  });
});

describe("contract violations soften to issues (STD7)", () => {
  it.each([
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["a string", "page=2"],
  ])(
    "non-object input (%s) becomes a single root issue with no path",
    (_label, input) => {
      const schema = standardSearchSchema(mixedRoute);
      const issues = expectIssues(validateSync(schema, input));
      expect(issues).toHaveLength(1);
      const [issue] = issues;
      expect(issue?.message).toMatch(/must be an object/);
      expect(Object.hasOwn(issue ?? {}, "path")).toBe(false);
    },
  );

  it("a decoded-value payload ({ page: 2 }) is a keyed issue — no coercion, ever (STD2)", () => {
    const schema = standardSearchSchema(mixedRoute);
    const issues = expectIssues(validateSync(schema, { page: 2 }));
    expect(issues).toEqual([
      {
        message: expect.stringContaining("must be a string") as string,
        path: ["page"],
      },
    ]);
  });

  it("a non-string array element is a keyed issue", () => {
    const schema = standardSearchSchema(mixedRoute);
    const issues = expectIssues(validateSync(schema, { tags: ["a", 1] }));
    expect(issues).toEqual([
      {
        message: expect.stringContaining("must be strings") as string,
        path: ["tags"],
      },
    ]);
  });

  it("a sparse array under a declared key softens to a keyed issue, not a throw", () => {
    // Regression: Array#every skips holes, but the decode's spread copy
    // materializes them as undefined — the two must agree, or a plain-data
    // input escapes validate() as a loud throw.
    const schema = standardSearchSchema(mixedRoute);
    const tags: string[] = [];
    tags[1] = "b"; // hole at index 0
    const issues = expectIssues(validateSync(schema, { tags }));
    expect(issues).toEqual([
      {
        message: expect.stringContaining("must be strings") as string,
        path: ["tags"],
      },
    ]);
  });

  it("an async rawSearch schema stays a loud ParamourError (D7)", () => {
    const asyncSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: (value) => Promise.resolve({ value }),
        vendor: "test",
        version: 1,
      },
    };
    const route = defineAppRoute("/raw", { search: rawSearch(asyncSchema) });
    const schema = standardSearchSchema(route);
    expect(() => validateSync(schema, {})).toThrow(ParamourError);
    expect(() => validateSync(schema, {})).toThrow(/synchronous/);
  });

  it("a rawSearch validator that THROWS stays loud, rebranded", () => {
    const throwingSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        validate: () => {
          throw new Error("boom");
        },
        vendor: "test",
        version: 1,
      },
    };
    const route = defineAppRoute("/raw", {
      search: rawSearch(throwingSchema),
    });
    const schema = standardSearchSchema(route);
    expect(() => validateSync(schema, {})).toThrow(ParamourError);
    expect(() => validateSync(schema, {})).toThrow(/schema validation threw/);
  });

  it("a missing/malformed search config throws at construction, not first validate", () => {
    const broken = { ...mixedRoute, "~search": null } as unknown as AnyRoute;
    expect(() => standardSearchSchema(broken)).toThrow(ParamourError);
    expect(() => standardSearchSchema(broken)).toThrow(
      /search config must be an object/,
    );
  });
});

describe("URLSearchParams accepted at runtime (STD3)", () => {
  it("decodes a genuine URLSearchParams, repeated pairs feeding an array codec", () => {
    const schema = standardSearchSchema(mixedRoute);
    const value = expectSuccess(
      validateSync(
        schema,
        new URLSearchParams("flag=true&page=2&tags=a&tags=b"),
      ),
    );
    expect(value).toEqual({
      flag: true,
      page: 2,
      q: undefined,
      tags: ["a", "b"],
    });
  });
});

describe("rawSearch routes (STD8)", () => {
  it("success returns the inner schema's own output (a real zod transform)", () => {
    const route = defineAppRoute("/raw", {
      search: rawSearch(z.object({ page: z.coerce.number(), q: z.string() })),
    });
    const schema = standardSearchSchema(route);
    const value = expectSuccess(validateSync(schema, { page: "2", q: "hi" }));
    expect(value).toEqual({ page: 2, q: "hi" });
  });

  it("a keyed vendor issue maps to path: [key]", () => {
    const route = defineAppRoute("/raw", {
      search: rawSearch(z.object({ q: z.string() })),
    });
    const schema = standardSearchSchema(route);
    const issues = expectIssues(validateSync(schema, {}));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["q"]);
  });

  it("a root vendor issue un-maps the <search> sentinel to an ABSENT path", () => {
    const rootIssueSchema: StandardSchemaV1<unknown, never> = {
      "~standard": {
        validate: () => ({
          issues: [{ message: "at least one filter is required", path: [] }],
        }),
        vendor: "test",
        version: 1,
      },
    };
    const route = defineAppRoute("/raw", {
      search: rawSearch(rootIssueSchema),
    });
    const schema = standardSearchSchema(route);
    const issues = expectIssues(validateSync(schema, {}));
    expect(issues).toHaveLength(1);
    const [issue] = issues;
    expect(issue?.message).toBe("at least one filter is required");
    expect(Object.hasOwn(issue ?? {}, "path")).toBe(false);
  });

  it("a non-string leaf under ANY key softens on the raw path (every own key is read)", () => {
    const route = defineAppRoute("/raw", {
      search: rawSearch(z.object({}).loose()),
    });
    const schema = standardSearchSchema(route);
    const issues = expectIssues(validateSync(schema, { junk: 42 }));
    expect(issues).toEqual([
      {
        message: expect.stringContaining("must be a string") as string,
        path: ["junk"],
      },
    ]);
  });
});
