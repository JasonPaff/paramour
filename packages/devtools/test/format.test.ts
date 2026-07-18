import { describeCodec, p } from "paramour";
import { describe, expect, it } from "vitest";

import {
  formatShape,
  formatWire,
  jsLiteral,
  reproSnippet,
  routeVariableName,
} from "../src/format.js";

describe("formatShape (DT7)", () => {
  it("renders kind, presence, default, catch, enum members, csv element", () => {
    expect(formatShape(describeCodec(p.integer()))).toBe("integer");
    expect(formatShape(describeCodec(p.string().optional()))).toBe("string?");
    expect(formatShape(describeCodec(p.integer().default(1)))).toBe(
      "integer =1",
    );
    expect(formatShape(describeCodec(p.integer().default(() => 1)))).toBe(
      "integer =ƒ()",
    );
    expect(
      formatShape(describeCodec(p.enum(["asc", "desc"]).catch("asc"))),
    ).toBe("enum(asc|desc) catch");
    expect(formatShape(describeCodec(p.csv(p.integer())))).toBe("csv<integer>");
    expect(formatShape(describeCodec(p.stringArray()))).toBe("string[]");
  });

  it("inlines a csv element's enum members (no drift from the CLI's walk)", () => {
    expect(formatShape(describeCodec(p.csv(p.enum(["a", "b"]))))).toBe(
      "csv<enum(a|b)>",
    );
  });
});

describe("formatWire (DT7)", () => {
  it("absence is a dash; values quote to make whitespace visible", () => {
    expect(formatWire(undefined)).toBe("—");
    expect(formatWire([])).toBe("—");
    expect(formatWire("a b")).toBe('"a b"');
    expect(formatWire(["x", ""])).toBe('"x", ""');
  });
});

describe("jsLiteral (DT9)", () => {
  it("prints values as source literals, Dates round-trippable", () => {
    expect(jsLiteral("hi")).toBe('"hi"');
    expect(jsLiteral(3)).toBe("3");
    expect(jsLiteral(true)).toBe("true");
    expect(jsLiteral(undefined)).toBe("undefined");
    expect(jsLiteral([1, "a"])).toBe('[1, "a"]');
    expect(jsLiteral(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      'new Date("2026-01-02T03:04:05.000Z")',
    );
    expect(jsLiteral({ a: 1, "b c": 2 })).toBe('{ a: 1, "b c": 2 }');
    expect(jsLiteral({})).toBe("{}");
  });
});

describe("routeVariableName (DT9)", () => {
  it("derives a camelCase placeholder from the pattern", () => {
    expect(routeVariableName("/shop/[slug]")).toBe("shopSlugRoute");
    expect(routeVariableName("/docs/[[...path]]")).toBe("docsPathRoute");
    expect(routeVariableName("/")).toBe("route");
    expect(routeVariableName("/user-settings")).toBe("userSettingsRoute");
  });
});

describe("reproSnippet (DT9)", () => {
  it("emits the href() call with empty halves omitted", () => {
    expect(reproSnippet("/shop", "app", undefined, undefined)).toBe(
      "href(shopRoute /* /shop (app router) */)",
    );
    expect(
      reproSnippet(
        "/shop/[slug]",
        "app",
        { slug: "foo" },
        { page: 3, tags: ["a", "b"] },
      ),
    ).toBe(
      'href(shopSlugRoute /* /shop/[slug] (app router) */, {\n  params: { slug: "foo" },\n  search: { page: 3, tags: ["a", "b"] },\n})',
    );
  });
});
