// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { defineAppRoute, p, rawSearch } from "paramour";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import {
  freshSeam,
  paramsObservation,
  searchObservation,
  setUrl,
} from "./helpers.js";

const kitchenRoute = defineAppRoute("/kitchen/[id]", {
  params: { id: p.integer() },
  search: {
    date: p.isoDate().optional(),
    flag: p.boolean().default(false),
    ids: p.csv(p.integer()),
    kind: p.enum(["asc", "desc"]).default("asc"),
    num: p.number().optional(),
    page: p.integer().default(1),
    q: p.string().optional(),
    tags: p.stringArray(),
    ts: p.timestamp().optional(),
  },
});

const rawRoute = defineAppRoute("/raw", {
  search: rawSearch(z.object({ q: z.string() })),
});

const bareRoute = defineAppRoute("/bare", {});

beforeEach(() => {
  setUrl("/kitchen/42?page=2&q=hi");
});

afterEach(cleanup);

describe("describeRoute-driven rendering (DT7)", () => {
  it("renders wire, parsed, and shape per codec kind", () => {
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(
        kitchenRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
      searchObservation(
        kitchenRoute,
        [
          ["page", "2"],
          ["q", "hi"],
        ],
        {
          data: {
            date: undefined,
            flag: false,
            ids: [],
            kind: "asc",
            num: undefined,
            page: 2,
            q: "hi",
            tags: [],
            ts: undefined,
          },
          status: "success",
        },
      ),
    );
    render(<ParamourDevtoolsPanel theme="light" />);

    // Banner + sidebar: pattern + router kind.
    expect(screen.getAllByText("/kitchen/[id]").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("app").length).toBeGreaterThanOrEqual(1);

    // Shapes per kind, straight from describeRoute.
    expect(screen.getByText("integer =1")).toBeDefined();
    expect(screen.getByText("enum(asc|desc) =asc")).toBeDefined();
    expect(screen.getByText("csv<integer>")).toBeDefined();
    expect(screen.getByText("string[]")).toBeDefined();
    expect(screen.getByText("isoDate?")).toBeDefined();
    expect(screen.getByText("timestamp?")).toBeDefined();
    expect(screen.getByText("boolean =false")).toBeDefined();

    // Wire and parsed columns.
    expect(screen.getAllByText('"2"').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("params rows are read-only: no edit widget in the params table (DT8)", () => {
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(
        kitchenRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    render(<ParamourDevtoolsPanel />);
    expect(screen.queryByLabelText("edit id")).toBeNull();
  });

  it("a rawSearch route renders its parsed value with the schema opaque", () => {
    setUrl("/raw?q=hi");
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(rawRoute, [["q", "hi"]], {
        data: { q: "hi" },
        status: "success",
      }),
    );
    render(<ParamourDevtoolsPanel />);
    expect(screen.getByText("raw (opaque schema)")).toBeDefined();
    expect(screen.getByText('{ q: "hi" }')).toBeDefined();
  });

  it("a route with no search config gets the quiet line", () => {
    setUrl("/bare");
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(bareRoute, {}, { data: {}, status: "success" }),
    );
    render(<ParamourDevtoolsPanel />);
    expect(screen.getByText("no search params declared")).toBeDefined();
  });
});
