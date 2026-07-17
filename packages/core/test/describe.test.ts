import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  defineAppRoute,
  definePagesRoute,
  describeCodec,
  describeRoute,
  p,
  rawSearch,
} from "../src";

describe("describeCodec", () => {
  it("reports each builder's kind", () => {
    expect(describeCodec(p.boolean()).kind).toBe("boolean");
    expect(describeCodec(p.csv()).kind).toBe("csv");
    expect(describeCodec(p.enum(["a", "b"])).kind).toBe("enum");
    expect(describeCodec(p.integer()).kind).toBe("integer");
    expect(describeCodec(p.isoDate()).kind).toBe("isoDate");
    expect(describeCodec(p.json(z.object({}))).kind).toBe("json");
    expect(describeCodec(p.number()).kind).toBe("number");
    expect(describeCodec(p.string()).kind).toBe("string");
    expect(describeCodec(p.stringArray()).kind).toBe("string");
    expect(describeCodec(p.timestamp()).kind).toBe("timestamp");
  });

  it("reports arity, presence, and caught in the base state", () => {
    expect(describeCodec(p.string())).toEqual({
      arity: "single",
      caught: false,
      kind: "string",
      presence: "required",
    });
    expect(describeCodec(p.stringArray()).arity).toBe("many");
  });

  it("omits inapplicable optional members entirely", () => {
    const description = describeCodec(p.string());
    expect("defaultValue" in description).toBe(false);
    expect("element" in description).toBe(false);
    expect("enumMembers" in description).toBe(false);
  });

  it("CV6: csv carries a nested element description", () => {
    expect(describeCodec(p.csv(p.integer())).element).toEqual({
      arity: "single",
      caught: false,
      kind: "integer",
      presence: "required",
    });
    // The no-arg form carries string element semantics (CV2).
    expect(describeCodec(p.csv()).element?.kind).toBe("string");
    expect(
      describeCodec(p.csv(p.enum(["a", "b"]))).element?.enumMembers,
    ).toEqual(["a", "b"]);
  });

  it("CV6: element survives modifiers; value defaults reflect the list wire form", () => {
    const modified = p.csv(p.integer()).default([1, 2]).catch([]);
    const description = describeCodec(modified);
    expect(description.element?.kind).toBe("integer");
    expect(description.defaultValue).toEqual({ kind: "value", wire: "1,2" });
    expect(describeCodec(p.csv().default([])).defaultValue).toEqual({
      kind: "value",
      wire: "",
    });
  });

  it("carries enum members", () => {
    expect(describeCodec(p.enum(["overview", "settings"])).enumMembers).toEqual(
      ["overview", "settings"],
    );
  });

  it("preserves kind and members through modifiers", () => {
    const modified = p.enum(["a", "b"]).default("a").catch("b");
    expect(describeCodec(modified)).toEqual({
      arity: "single",
      caught: true,
      defaultValue: { kind: "value", wire: "a" },
      enumMembers: ["a", "b"],
      kind: "enum",
      presence: "defaulted",
    });
  });

  it("reports optional presence", () => {
    expect(describeCodec(p.integer().optional()).presence).toBe("optional");
  });

  it("serializes value-form defaults to their wire form", () => {
    expect(describeCodec(p.integer().default(5)).defaultValue).toEqual({
      kind: "value",
      wire: "5",
    });
    expect(
      describeCodec(p.isoDate().default(new Date("2026-01-02T00:00:00.000Z")))
        .defaultValue,
    ).toEqual({ kind: "value", wire: "2026-01-02" });
  });

  it("reports factory defaults without invoking a wire preview", () => {
    let calls = 0;
    const codec = p.integer().default(() => {
      calls += 1;
      return 5;
    });
    expect(describeCodec(codec).defaultValue).toEqual({ kind: "factory" });
    expect(calls).toBe(0);
  });

  it("degrades a since-mutated value default to the factory arm", () => {
    const schema = z.object({ n: z.number() });
    const value = { n: 1 };
    const codec = p.json(schema).default(value);
    // Mutating the reference after define time makes it unserializable by
    // the schema; reflection degrades instead of throwing.
    (value as { n: unknown }).n = "boom";
    expect(describeCodec(codec).defaultValue).toEqual({ kind: "factory" });
  });

  it('labels custom codecs, defaulting to "custom"', () => {
    const impl = {
      parse: (raw: string) => raw,
      serialize: (value: string) => value,
    };
    expect(describeCodec(p.custom(impl)).kind).toBe("custom");
    expect(describeCodec(p.custom({ ...impl, label: "slug" })).kind).toBe(
      "slug",
    );
  });
});

describe("describeRoute", () => {
  it("describes an app route's params and search", () => {
    const route = defineAppRoute("/product/[id]/[...rest]", {
      params: { id: p.integer(), rest: p.string() },
      search: { q: p.string().optional(), tags: p.stringArray() },
    });
    expect(describeRoute(route)).toEqual({
      params: {
        id: {
          arity: "single",
          caught: false,
          kind: "integer",
          presence: "required",
          segmentKind: "single",
        },
        rest: {
          arity: "single",
          caught: false,
          kind: "string",
          presence: "required",
          segmentKind: "catchall",
        },
      },
      path: "/product/[id]/[...rest]",
      router: "app",
      search: {
        keys: {
          q: {
            arity: "single",
            caught: false,
            kind: "string",
            presence: "optional",
          },
          tags: {
            arity: "many",
            caught: false,
            kind: "string",
            presence: "required",
          },
        },
        kind: "codecs",
      },
    });
  });

  it("describes an optional catch-all segment", () => {
    const route = defineAppRoute("/docs/[[...slug]]", {
      params: { slug: p.string() },
    });
    expect(describeRoute(route).params.slug?.segmentKind).toBe(
      "optional-catchall",
    );
  });

  it("brands the pages router", () => {
    const route = definePagesRoute("/legacy/[id]", {
      params: { id: p.string() },
    });
    expect(describeRoute(route).router).toBe("pages");
  });

  it("describes a static route as empty params and no search", () => {
    const route = defineAppRoute("/about", {});
    expect(describeRoute(route)).toEqual({
      params: {},
      path: "/about",
      router: "app",
      search: { kind: "none" },
    });
  });

  it("describes a rawSearch slot as raw", () => {
    const route = defineAppRoute("/search", {
      search: rawSearch(z.object({ q: z.string() })),
    });
    expect(describeRoute(route).search).toEqual({ kind: "raw" });
  });
});
