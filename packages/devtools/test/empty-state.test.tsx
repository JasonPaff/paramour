// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineAppRoute } from "paramour";
import { afterEach, describe, expect, it } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { emitToSeam, freshSeam, paramsObservation, setUrl } from "./helpers.js";

const route = defineAppRoute("/home", {});

afterEach(cleanup);

describe("empty state (DT18)", () => {
  it("shows the quiet informational copy before any observation, and clears on the first", async () => {
    setUrl("/home");
    const seam = freshSeam();
    render(<ParamourDevtoolsPanel />);
    expect(
      screen.getByText(
        "No routes observed yet — navigate using a paramour hook to see it here.",
      ),
    ).toBeDefined();
    // Informational styling, not an error.
    expect(document.querySelector(".pmr-empty")).not.toBeNull();
    expect(document.querySelector(".pmr-issues")).toBeNull();

    // Async act: live notification defers a microtask (the render-phase-emit
    // guard in the store), so the DOM update needs the microtask flushed.
    await act(async () => {
      emitToSeam(
        seam,
        paramsObservation(route, {}, { data: {}, status: "success" }),
      );
      await Promise.resolve();
    });
    expect(
      screen.queryByText(
        "No routes observed yet — navigate using a paramour hook to see it here.",
      ),
    ).toBeNull();
    expect(screen.getAllByText("/home").length).toBeGreaterThanOrEqual(1);
  });
});
