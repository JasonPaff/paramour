/**
 * Unit tests for the devtools observation seam (design-12 DT5/DT6): the
 * global slot's buffer capping, replay-to-a-late-listener protocol,
 * unsubscribe, listener isolation, and the production no-op guard. Full DCE
 * of the guarded call sites is the bundler's contract, not testable here —
 * this suite pins the GUARD's behavior (`emitObservation` returns before
 * touching the slot under `NODE_ENV === "production"`).
 */
import { defineAppRoute } from "paramour";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamourObservation } from "../src/devtools-seam.js";

import {
  emitObservation,
  getParamourSeam,
  OBSERVATION_BUFFER_CAP,
} from "../src/devtools-seam.js";

const route = defineAppRoute("/seam-test", {});

function makeObservation(tag: string): ParamourObservation {
  return {
    hook: "app.useRouteParams",
    kind: "params",
    navigate: () => undefined,
    pathname: "/seam-test",
    result: { data: {}, status: "success" },
    route,
    routerKind: "app",
    wire: { tag },
  };
}

// The slot persists on globalThis across tests in a worker; resetting through
// the public accessor doubles as documentation of the data-only contract.
beforeEach(() => {
  const seam = getParamourSeam();
  seam.buffer.length = 0;
  seam.listeners.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getParamourSeam", () => {
  it("creates the slot once and returns the same object after", () => {
    const first = getParamourSeam();
    expect(getParamourSeam()).toBe(first);
    expect(first.version).toBe(1);
  });
});

describe("emitObservation", () => {
  it("caps the buffer FIFO, dropping the oldest past the cap", () => {
    for (let index = 0; index < OBSERVATION_BUFFER_CAP + 5; index += 1) {
      emitObservation(makeObservation(String(index)));
    }
    const seam = getParamourSeam();
    expect(seam.buffer).toHaveLength(OBSERVATION_BUFFER_CAP);
    // Entries 0..4 were dropped; the head is entry 5.
    expect(seam.buffer[0]?.wire).toEqual({ tag: "5" });
  });

  it("replays to a late listener: read buffer, then add, misses nothing", () => {
    emitObservation(makeObservation("early-1"));
    emitObservation(makeObservation("early-2"));

    // The DT5 attach protocol, verbatim: synchronous read-then-add.
    const seam = getParamourSeam();
    const seen: ParamourObservation[] = [...seam.buffer];
    seam.listeners.add((observation) => seen.push(observation));

    emitObservation(makeObservation("live-1"));
    expect(seen.map((entry) => entry.wire)).toEqual([
      { tag: "early-1" },
      { tag: "early-2" },
      { tag: "live-1" },
    ]);
  });

  it("stops delivering after listeners.delete", () => {
    const seen: ParamourObservation[] = [];
    const listener = (observation: ParamourObservation): void => {
      seen.push(observation);
    };
    const seam = getParamourSeam();
    seam.listeners.add(listener);
    emitObservation(makeObservation("before"));
    seam.listeners.delete(listener);
    emitObservation(makeObservation("after"));
    expect(seen).toHaveLength(1);
  });

  it("isolates a throwing listener: no propagation, later listeners still fire", () => {
    const seen: ParamourObservation[] = [];
    const seam = getParamourSeam();
    seam.listeners.add(() => {
      throw new Error("panel bug");
    });
    seam.listeners.add((observation) => seen.push(observation));
    expect(() => {
      emitObservation(makeObservation("resilient"));
    }).not.toThrow();
    expect(seen).toHaveLength(1);
  });

  it('is a no-op when NODE_ENV === "production" (DT6 guard behavior)', () => {
    const seen: ParamourObservation[] = [];
    const seam = getParamourSeam();
    seam.listeners.add((observation) => seen.push(observation));
    vi.stubEnv("NODE_ENV", "production");
    emitObservation(makeObservation("prod"));
    expect(seam.buffer).toHaveLength(0);
    expect(seen).toHaveLength(0);
  });
});
