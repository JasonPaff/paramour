// @vitest-environment happy-dom
/**
 * The copy-url source (design-12 DT9): a CURRENT session copies the live
 * `window.location.href`; a STALE session's snapshot is a page that is no
 * longer mounted, so its URL is rebuilt from the parsed halves via `href` —
 * copying the live location there would hand the user the WRONG page.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defineAppRoute, p } from "paramour";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import {
  freshSeam,
  paramsObservation,
  searchObservation,
  setUrl,
} from "./helpers.js";

const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { page: p.integer().default(1) },
});

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(cleanup);

function observeProduct(): void {
  const seam = freshSeam();
  seam.buffer.push(
    paramsObservation(
      productRoute,
      { id: "42" },
      { data: { id: 42 }, status: "success" },
    ),
    searchObservation(productRoute, [["page", "2"]], {
      data: { page: 2 },
      status: "success",
    }),
  );
}

describe("copy url (DT9)", () => {
  it("a stale session copies ITS snapshot URL, not the live location", () => {
    setUrl("/shop");
    observeProduct();
    render(<ParamourDevtoolsPanel />);
    // The product session doesn't match /shop — pin it from the sidebar.
    fireEvent.click(screen.getByText("/product/[id]"));
    fireEvent.click(screen.getByText("copy url"));
    expect(writeText).toHaveBeenCalledExactlyOnceWith("/product/42?page=2");
  });

  it("a current session copies the live location href", () => {
    setUrl("/product/42?page=2&utm_source=x");
    observeProduct();
    render(<ParamourDevtoolsPanel />);
    fireEvent.click(screen.getByText("copy url"));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(window.location.href);
  });

  it("hides copy url for a stale session whose URL cannot be rebuilt", () => {
    setUrl("/shop");
    const seam = freshSeam();
    // Params errored: there is no parsed `id` to rebuild the path from.
    seam.buffer.push(
      paramsObservation(productRoute, { id: "abc" }, {
        error: { issues: [{ key: "id", message: "expected integer" }] },
        status: "error",
      } as never),
    );
    render(<ParamourDevtoolsPanel />);
    fireEvent.click(screen.getByText("/product/[id]"));
    expect(screen.queryByText("copy url")).toBeNull();
  });
});
