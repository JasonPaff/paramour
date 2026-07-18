// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { defineAppRoute, p, safeDecodeSearch } from "paramour";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { freshSeam, searchObservation, setUrl } from "./helpers.js";

const route = defineAppRoute("/list", {
  search: {
    page: p.integer().default(1),
    sort: p.enum(["asc", "desc"]).catch("asc"),
  },
});

function observeWire(pairs: readonly (readonly [string, string])[]): void {
  const seam = freshSeam();
  const result = safeDecodeSearch(
    route,
    new URLSearchParams(pairs.map(([key, value]) => [key, value])),
  );
  seam.buffer.push(searchObservation(route, pairs, result));
}

beforeEach(() => {
  setUrl("/list");
});

afterEach(cleanup);

describe("attribution inference (DT7/DT16)", () => {
  it("wire absent + defaulted → the neutral default tag", () => {
    observeWire([]);
    render(<ParamourDevtoolsPanel />);
    expect(screen.getByText("default")).toBeDefined();
  });

  it("parse failed + caught → the neutral catch tag", () => {
    observeWire([["sort", "bogus"]]);
    render(<ParamourDevtoolsPanel />);
    expect(screen.getByText("catch")).toBeDefined();
  });

  it("no tag when a defaulted key is present on the wire", () => {
    observeWire([["page", "5"]]);
    render(<ParamourDevtoolsPanel />);
    expect(screen.queryByText("default")).toBeNull();
  });

  it("no tag when a caught key parses cleanly", () => {
    observeWire([["sort", "desc"]]);
    render(<ParamourDevtoolsPanel />);
    expect(screen.queryByText("catch")).toBeNull();
  });
});
