// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { defineAppRoute, p, rawSearch, safeDecodeSearch } from "paramour";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { freshSeam, searchObservation, setUrl } from "./helpers.js";

const route = defineAppRoute("/list", {
  search: { page: p.integer(), q: p.string() },
});

// A schema that fails at the ROOT (the record is not a string) produces the
// empty-path issue core maps to the "<search>" sentinel key.
const rawRoute = defineAppRoute("/raw", {
  search: rawSearch(z.string()),
});

beforeEach(() => {
  setUrl("/list");
});

afterEach(cleanup);

describe("issues rendering (DT7)", () => {
  it("renders one row per failed key from the LIVE error's issues", () => {
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(
        route,
        [["page", "abc"]],
        safeDecodeSearch(route, { page: "abc" }),
      ),
    );
    render(<ParamourDevtoolsPanel />);
    const issues = document.querySelector(".pmr-issues");
    expect(issues).not.toBeNull();
    // page failed its parse; q is required-missing — one row each.
    expect(issues?.textContent).toContain("page");
    expect(issues?.textContent).toContain("q");
    expect(issues?.textContent).toContain("required search param is missing");
  });

  it('renders the raw-search root sentinel "<search>" as a whole-search row', () => {
    setUrl("/raw");
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(rawRoute, [], safeDecodeSearch(rawRoute, {})),
    );
    render(<ParamourDevtoolsPanel />);
    expect(screen.getByText("(whole search)")).toBeDefined();
  });

  it("the section is absent when there are no issues (DT15)", () => {
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(
        route,
        [
          ["page", "2"],
          ["q", "x"],
        ],
        safeDecodeSearch(route, { page: "2", q: "x" }),
      ),
    );
    render(<ParamourDevtoolsPanel />);
    expect(document.querySelector(".pmr-issues")).toBeNull();
  });
});
