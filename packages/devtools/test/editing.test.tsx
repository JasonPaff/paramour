// @vitest-environment happy-dom
import type { AnyRoute } from "paramour";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defineAppRoute, p, safeDecodeSearch } from "paramour";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamourSearchWire } from "../src/seam.js";

import { ParamourDevtoolsPanel } from "../src/components/panel.js";
import { freshSeam, searchObservation, setUrl } from "./helpers.js";

const route = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: {
    page: p.integer().default(1),
    q: p.string().optional(),
    sort: p.enum(["asc", "desc"]).catch("asc").default("asc"),
  },
});

function observe(pairs: ParamourSearchWire): ReturnType<typeof vi.fn> {
  return observeOn(route, pairs);
}

function observeOn(
  observedRoute: AnyRoute,
  pairs: ParamourSearchWire,
): ReturnType<typeof vi.fn> {
  const navigate = vi.fn();
  const seam = freshSeam();
  const result = safeDecodeSearch(
    observedRoute,
    new URLSearchParams(pairs.map(([key, value]) => [key, value])),
  );
  seam.buffer.push(
    searchObservation(observedRoute, pairs, result, { navigate }),
  );
  return navigate;
}

beforeEach(() => {
  setUrl("/product/42?page=2&q=hi%20there");
});

afterEach(cleanup);

describe("commit-to-push (DT8)", () => {
  it("Enter serializes the full pair list through buildSearchString and navigates — spaces as %20, never +", () => {
    const navigate = observe([
      ["page", "2"],
      ["q", "hi there"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=5&q=hi%20there");
  });

  it("an edit equal to the default elides the key (D8)", () => {
    const navigate = observe([
      ["page", "2"],
      ["q", "hi there"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?q=hi%20there");
  });

  it("clear-to-absent omits the key", () => {
    const navigate = observe([
      ["page", "2"],
      ["q", "hi there"],
    ]);
    render(<ParamourDevtoolsPanel />);
    fireEvent.click(screen.getByLabelText("clear q to absent"));
    const input = screen.getByLabelText("edit page");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=2");
  });

  it("untouched invalid-but-caught wire carries verbatim, never re-serialized", () => {
    setUrl("/product/42?page=2&sort=bogus");
    const navigate = observe([
      ["page", "2"],
      ["sort", "bogus"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=3&sort=bogus");
  });

  it("unknown keys carry verbatim", () => {
    setUrl("/product/42?page=2&utm_source=x");
    const navigate = observe([
      ["page", "2"],
      ["utm_source", "x"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=3&utm_source=x");
  });

  it("an invalid codec-mode edit blocks navigation and shows the issue", () => {
    const navigate = observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector(".pmr-preview--error")).not.toBeNull();
  });
});

describe("commit uses the LIVE wire, not the decode-time snapshot", () => {
  // Undeclared-key churn never re-emits (SEL4 fingerprints declared keys
  // only), so the observation's wire snapshot can be stale in both
  // directions; the carried-verbatim pairs must come from the URL as it is
  // at commit time.
  it("does not resurrect an undeclared pair the app removed after the last emit", () => {
    setUrl("/product/42?page=2&utm_source=mail");
    const navigate = observe([
      ["page", "2"],
      ["utm_source", "mail"],
    ]);
    render(<ParamourDevtoolsPanel />);
    // The app strips utm_source via replace; the declared slice is
    // unchanged, so no new observation arrives.
    setUrl("/product/42?page=2");
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=5");
  });

  it("carries an undeclared pair added after the last emit", () => {
    setUrl("/product/42?page=2");
    const navigate = observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    setUrl("/product/42?page=2&ref=mail");
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=5&ref=mail");
  });
});

describe("blur-commit race (DT8)", () => {
  it("mousedown on ⌀ and the raw toggle prevents default so a pending draft is not blur-committed first", () => {
    // In a real browser, mousedown on the button blurs a focused input
    // BEFORE the click handler runs; blur commits the draft and navigates,
    // losing the clear/toggle. preventDefault on mousedown keeps focus.
    setUrl("/product/42?page=2");
    observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    expect(
      fireEvent.mouseDown(screen.getByLabelText("clear page to absent")),
    ).toBe(false);
    expect(
      fireEvent.mouseDown(
        screen.getByLabelText("toggle raw wire editing for page"),
      ),
    ).toBe(false);
  });
});

describe("repeated-key wire on a single-line widget", () => {
  it("seeds the input from the FIRST pair instead of newline-joining", () => {
    // `?page=1&page=2` on an arity-one codec: a '1\n2' seed gets
    // value-sanitized by the input into a fabricated '12', which the first
    // keystroke turns into a committed draft replacing both pairs.
    setUrl("/product/42?page=1&page=2");
    observe([
      ["page", "1"],
      ["page", "2"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("edit page");
    expect(input.value).toBe("1");
  });
});

describe("raw wire mode (DT8)", () => {
  it("a deliberately invalid raw value passes through, percent-encoded at the byte layer only", () => {
    setUrl("/product/42?page=2");
    const navigate = observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    fireEvent.click(screen.getByLabelText("toggle raw wire editing for page"));
    const input = screen.getByLabelText("raw wire for page");
    fireEvent.change(input, { target: { value: "not a number" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=not%20a%20number");
  });
});

describe("live preview (DT8)", () => {
  it("shows what a valid draft WOULD parse to", () => {
    observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "7" } });
    expect(screen.getByText("→ 7")).toBeDefined();
  });

  it("shows the issue message for an invalid draft", () => {
    observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit page");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(document.querySelector(".pmr-preview--error")).not.toBeNull();
  });
});

describe("boolean checkbox (DT8)", () => {
  const flagsRoute = defineAppRoute("/flags", {
    search: {
      flag: p.boolean().default(false),
      on: p.boolean().default(true),
    },
  });

  it("renders the EFFECTIVE parsed value when the wire is absent", () => {
    setUrl("/flags");
    observeOn(flagsRoute, []);
    render(<ParamourDevtoolsPanel />);
    const on = screen.getByLabelText<HTMLInputElement>("edit on");
    const flag = screen.getByLabelText<HTMLInputElement>("edit flag");
    // No wire at all: `on` defaults to true and must render checked;
    // `flag` defaults to false and must render unchecked.
    expect(on.checked).toBe(true);
    expect(flag.checked).toBe(false);
  });

  it("a toggle commits in the same click — the commit sees the just-made draft", () => {
    setUrl("/flags");
    const navigate = observeOn(flagsRoute, []);
    render(<ParamourDevtoolsPanel />);
    fireEvent.click(screen.getByLabelText("edit flag"));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?flag=true");
  });

  it("unchecking a defaulted-true boolean commits the false wire", () => {
    setUrl("/flags");
    const navigate = observeOn(flagsRoute, []);
    render(<ParamourDevtoolsPanel />);
    fireEvent.click(screen.getByLabelText("edit on"));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?on=false");
  });
});

describe("enum select (DT8)", () => {
  const sortedRoute = defineAppRoute("/sorted", {
    search: {
      order: p.enum(["newest", "oldest"]).default("oldest"),
      sort: p.enum(["asc", "desc"]).optional(),
    },
  });

  it("an absent optional enum renders no phantom selection", () => {
    // Without a matching option for the empty draft, the browser displays
    // the FIRST member as selected while the draft stays "" — making that
    // member unpickable (selecting it fires no change event).
    setUrl("/sorted");
    observeOn(sortedRoute, []);
    render(<ParamourDevtoolsPanel />);
    const select = screen.getByLabelText<HTMLSelectElement>("edit sort");
    expect(select.value).toBe("");
  });

  it("an absent defaulted enum renders its effective member", () => {
    setUrl("/sorted");
    observeOn(sortedRoute, []);
    render(<ParamourDevtoolsPanel />);
    const select = screen.getByLabelText<HTMLSelectElement>("edit order");
    expect(select.value).toBe("oldest");
  });

  it("selecting the first member from the absent state commits it", () => {
    setUrl("/sorted");
    const navigate = observeOn(sortedRoute, []);
    render(<ParamourDevtoolsPanel />);
    const select = screen.getByLabelText<HTMLSelectElement>("edit sort");
    fireEvent.change(select, { target: { value: "asc" } });
    fireEvent.blur(select);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?sort=asc");
  });
});

describe("array textarea (DT8)", () => {
  const tagsRoute = defineAppRoute("/tags", {
    search: { tags: p.array() },
  });

  it("renders a textarea seeded one wire value per line and commits every line", () => {
    setUrl("/tags?tags=a&tags=b");
    const navigate = observeOn(tagsRoute, [
      ["tags", "a"],
      ["tags", "b"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>("edit tags");
    // The element must actually BE the textarea: the single-line fallback
    // also matches getByLabelText, but it seeds from the first pair only —
    // committing from it silently drops every other repeated value.
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.value).toBe("a\nb");
    expect(textarea.placeholder).toBe("one value per line");
    fireEvent.change(textarea, { target: { value: "a\nb\nc" } });
    fireEvent.blur(textarea);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?tags=a&tags=b&tags=c");
  });

  it("csv keeps its single-line input with the element comma hint", () => {
    // The csv-vs-array contrast the widget dispatch must preserve: csv's
    // one comma-joined wire value edits in a plain input, and only csv may
    // show the `element,…` comma hint — on a repeated-key array it would
    // invite a comma-joined value the element parse rejects.
    const csvRoute = defineAppRoute("/csv", {
      search: { ids: p.csv(p.integer()) },
    });
    setUrl("/csv?ids=1,2");
    observeOn(csvRoute, [["ids", "1,2"]]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("edit ids");
    expect(input.tagName).toBe("INPUT");
    expect(input.placeholder).toBe("integer,…");
  });

  it("clearing the textarea removes the key instead of committing one empty element", () => {
    setUrl("/tags?tags=a&tags=b");
    const navigate = observeOn(tagsRoute, [
      ["tags", "a"],
      ["tags", "b"],
    ]);
    render(<ParamourDevtoolsPanel />);
    const textarea = screen.getByLabelText("edit tags");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.blur(textarea);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("");
  });
});

describe("index number input (DT8)", () => {
  it("p.index gets the integer number widget, not a free-text input", () => {
    // p.index shares p.integer's wire grammar (a strict digit string, floor
    // 1), so it must get the same number widget — type "number", step "1" —
    // plus the wire floor as min.
    const pagedRoute = defineAppRoute("/paged", {
      search: { page: p.index() },
    });
    setUrl("/paged?page=3");
    observeOn(pagedRoute, [["page", "3"]]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText<HTMLInputElement>("edit page");
    expect(input.type).toBe("number");
    expect(input.step).toBe("1");
    expect(input.min).toBe("1");
  });
});

describe("commit failure containment (DT8)", () => {
  it("a value the byte layer cannot encode marks the draft invalid instead of crashing the panel", () => {
    // A lone surrogate survives p.string()'s parse (and the live preview)
    // but throws in percent-encoding at commit time; the throw must be
    // contained inside commit — never escape the event handler.
    const onWindowError = vi.fn();
    window.addEventListener("error", onWindowError);
    const navigate = observe([["page", "2"]]);
    render(<ParamourDevtoolsPanel />);
    const input = screen.getByLabelText("edit q");
    fireEvent.change(input, { target: { value: "\uD800" } });
    fireEvent.keyDown(input, { key: "Enter" });
    window.removeEventListener("error", onWindowError);
    expect(onWindowError).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    // The failed commit keeps the draft editable: correcting it commits.
    fireEvent.change(input, { target: { value: "ok" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("?page=2&q=ok");
  });
});
