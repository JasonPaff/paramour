// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { defineAppRoute } from "paramour";
import { afterEach, describe, expect, it } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { paramourDevtoolsPlugin } from "../src/plugin.js";
import { freshSeam, paramsObservation, setUrl } from "./helpers.js";

const route = defineAppRoute("/home", {});

afterEach(cleanup);

describe("theme switching", () => {
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

  it("the plugin entry renders the theme the shell passes to render()", () => {
    // TanStack's shell calls a function render as render(el, { theme, … })
    // on every theme change; an element render never receives the theme.
    freshSeam();
    const entry = paramourDevtoolsPlugin();
    const host = document.createElement("div");
    const { container, rerender } = render(
      entry.render(host, { theme: "dark" }),
    );
    const root = container.querySelector(".pmr-root");
    expect(root?.getAttribute("data-theme")).toBe("dark");

    rerender(entry.render(host, { theme: "light" }));
    expect(container.querySelector(".pmr-root")).toBe(root);
    expect(root?.getAttribute("data-theme")).toBe("light");
  });

  it("defaults to light when the shell passes no theme", () => {
    freshSeam();
    const { container } = render(<ParamourDevtoolsPanel />);
    expect(
      container.querySelector(".pmr-root")?.getAttribute("data-theme"),
    ).toBe("light");
  });
});
