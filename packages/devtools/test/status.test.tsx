// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import {
  defineAppRoute,
  definePagesRoute,
  p,
  safeDecodeSearch,
} from "paramour";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import {
  freshSeam,
  paramsObservation,
  searchObservation,
  setUrl,
} from "./helpers.js";

const okRoute = defineAppRoute("/ok", {});
const errorRoute = defineAppRoute("/error", {
  search: { page: p.integer() },
});
const pendingRoute = definePagesRoute("/pending", {});

beforeEach(() => {
  setUrl("/ok");
});

afterEach(cleanup);

describe("status → dot + glyph mapping (DT16)", () => {
  it("renders the right class, glyph, and aria-label per status", () => {
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(okRoute, {}, { data: {}, status: "success" }),
      searchObservation(
        errorRoute,
        [["page", "abc"]],
        safeDecodeSearch(errorRoute, { page: "abc" }),
        { hook: "app.useSearch" },
      ),
      searchObservation(
        pendingRoute,
        [],
        { status: "pending" },
        {
          hook: "pages.useSearch",
        },
      ),
    );
    render(<ParamourDevtoolsPanel />);

    // /ok is current → green ok dot with the check glyph.
    const okDots = screen.getAllByLabelText("ok");
    expect(okDots[0]?.className).toContain("pmr-dot--ok");
    expect(okDots[0]?.textContent).toBe("✓");

    // /error and /pending are non-current in the sidebar → stale gray
    // (positional, DT10); their own status shows when selected. The sidebar
    // still carries their entries.
    const staleDots = screen.getAllByLabelText("stale");
    expect(staleDots.length).toBeGreaterThanOrEqual(2);
    expect(staleDots[0]?.className).toContain("pmr-dot--stale");
    expect(staleDots[0]?.textContent).toBe("∅");
  });

  it("error and pending statuses surface on their sessions when current", () => {
    setUrl("/error");
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(
        errorRoute,
        [["page", "abc"]],
        safeDecodeSearch(errorRoute, { page: "abc" }),
      ),
    );
    render(<ParamourDevtoolsPanel />);
    const errorDots = screen.getAllByLabelText("error");
    expect(errorDots[0]?.className).toContain("pmr-dot--error");
    expect(errorDots[0]?.textContent).toBe("✕");
  });

  it("a Pages pending result renders the amber pending dot (DT7/DT11)", () => {
    setUrl("/pending");
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(
        pendingRoute,
        [],
        { status: "pending" },
        {
          hook: "pages.useSearch",
        },
      ),
    );
    render(<ParamourDevtoolsPanel />);
    const pendingDots = screen.getAllByLabelText("pending");
    expect(pendingDots[0]?.className).toContain("pmr-dot--pending");
    expect(pendingDots[0]?.textContent).toBe("◷");
  });
});
