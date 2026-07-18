// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { defineAppRoute } from "paramour";
import { afterEach, describe, expect, it } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { freshSeam, paramsObservation, setUrl } from "./helpers.js";

const route = defineAppRoute("/home", {});

afterEach(cleanup);

describe("theme switching (DT14)", () => {
  it("flips data-theme on the SAME root node — no remount", () => {
    setUrl("/home");
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(route, {}, { data: {}, status: "success" }),
    );
    const { container, rerender } = render(
      <ParamourDevtoolsPanel theme="light" />,
    );
    const root = container.querySelector(".pmr-root");
    expect(root?.getAttribute("data-theme")).toBe("light");

    rerender(<ParamourDevtoolsPanel theme="dark" />);
    expect(container.querySelector(".pmr-root")).toBe(root);
    expect(root?.getAttribute("data-theme")).toBe("dark");
  });

  it("defaults to light when the shell passes no theme", () => {
    freshSeam();
    const { container } = render(<ParamourDevtoolsPanel />);
    expect(
      container.querySelector(".pmr-root")?.getAttribute("data-theme"),
    ).toBe("light");
  });
});
