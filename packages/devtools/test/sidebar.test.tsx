// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defineAppRoute, p } from "paramour";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { freshSeam, paramsObservation, setUrl } from "./helpers.js";

const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
});
const shopRoute = defineAppRoute("/shop", {});
const docsCatchallRoute = defineAppRoute("/docs/[[...path]]", {
  params: { path: p.string() },
});
const docsSlugRoute = defineAppRoute("/docs/[slug]", {
  params: { slug: p.string() },
});

beforeEach(() => {
  setUrl("/product/42");
});

afterEach(cleanup);

describe("session sidebar (DT10/DT15)", () => {
  it("lists sessions in first-observed order; non-current entries are stale", () => {
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(shopRoute, {}, { data: {}, status: "success" }),
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    render(<ParamourDevtoolsPanel />);
    const entries = screen.getAllByRole("button", { name: /\/(shop|product)/ });
    expect(entries[0]?.textContent).toContain("/shop");
    expect(entries[0]?.getAttribute("data-stale")).toBe("true");
    expect(entries[1]?.textContent).toContain("/product/[id]");
    expect(entries[1]?.getAttribute("data-stale")).toBe("false");
  });

  it("auto-focuses the current route; selecting a stale one shows its snapshot read-only", () => {
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(shopRoute, {}, { data: {}, status: "success" }),
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    render(<ParamourDevtoolsPanel />);
    // Auto mode: the main pane shows the current route's banner only.
    expect(document.querySelector(".pmr-banner-path")?.textContent).toBe(
      "/product/[id]",
    );

    const shopEntry = screen.getAllByRole("button", { name: /\/shop/ })[0];
    if (shopEntry === undefined) throw new Error("missing sidebar entry");
    fireEvent.click(shopEntry);
    expect(document.querySelector(".pmr-banner-path")?.textContent).toBe(
      "/shop",
    );
    expect(screen.getByText("stale snapshot")).toBeDefined();
  });

  it("stacks every current-matching session (layout + page both report, DT10)", () => {
    setUrl("/docs/intro");
    const seam = freshSeam();
    seam.buffer.push(
      paramsObservation(
        docsCatchallRoute,
        { path: "intro" },
        { data: { path: "intro" }, status: "success" },
      ),
      paramsObservation(
        docsSlugRoute,
        { slug: "intro" },
        { data: { slug: "intro" }, status: "success" },
      ),
    );
    render(<ParamourDevtoolsPanel />);
    const banners = [...document.querySelectorAll(".pmr-banner-path")].map(
      (node) => node.textContent,
    );
    expect(banners).toEqual(["/docs/[[...path]]", "/docs/[slug]"]);
  });
});
