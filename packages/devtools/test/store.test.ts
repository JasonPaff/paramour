// @vitest-environment happy-dom
import { defineAppRoute, definePagesRoute, p } from "paramour";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getServerSnapshot, getSnapshot, subscribe } from "../src/store.js";
import {
  emitToSeam,
  freshSeam,
  paramsObservation,
  searchObservation,
  setUrl,
} from "./helpers.js";

const productRoute = defineAppRoute("/product/[id]", {
  params: { id: p.integer() },
  search: { page: p.integer().default(1) },
});

const shopRoute = defineAppRoute("/shop", {});

beforeEach(() => {
  setUrl("/product/42?page=2");
});

describe("replay (DT5)", () => {
  it("a late subscriber sees everything buffered before it attached", () => {
    const seam = freshSeam();
    seam.buffer.push(
      searchObservation(productRoute, [["page", "2"]], {
        data: { page: 2 },
        status: "success",
      }),
      paramsObservation(shopRoute, {}, { data: {}, status: "success" }),
    );
    const unsubscribe = subscribe(() => undefined);
    const snapshot = getSnapshot();
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.sessions.map((session) => session.key)).toEqual([
      "app:/product/[id]",
      "app:/shop",
    ]);
    unsubscribe();
  });
});

describe("session grouping (DT10)", () => {
  it("groups HMR-reminted route objects under one path+router key, latest route wins", () => {
    const seam = freshSeam();
    const remintedRoute = defineAppRoute("/product/[id]", {
      params: { id: p.integer() },
      search: { page: p.integer().default(1) },
    });
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      searchObservation(productRoute, [], {
        data: { page: 1 },
        status: "success",
      }),
    );
    emitToSeam(
      seam,
      searchObservation(remintedRoute, [], {
        data: { page: 1 },
        status: "success",
      }),
    );
    const snapshot = getSnapshot();
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.route).toBe(remintedRoute);
    unsubscribe();
  });

  it("distinguishes app and pages routes sharing a path", () => {
    const seam = freshSeam();
    const pagesTwin = definePagesRoute("/product/[id]", {
      params: { id: p.integer() },
    });
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "1" },
        { data: { id: 1 }, status: "success" },
      ),
    );
    emitToSeam(
      seam,
      paramsObservation(
        pagesTwin,
        { id: "1" },
        { data: { id: 1 }, status: "success" },
      ),
    );
    expect(getSnapshot().sessions).toHaveLength(2);
    unsubscribe();
  });

  it("merges params and search halves into one session", () => {
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    emitToSeam(
      seam,
      searchObservation(productRoute, [["page", "2"]], {
        data: { page: 2 },
        status: "success",
      }),
    );
    const snapshot = getSnapshot();
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.params?.kind).toBe("params");
    expect(snapshot.sessions[0]?.search?.kind).toBe("search");
    unsubscribe();
  });
});

describe("status derivation (DT16)", () => {
  it("error beats pending beats ok across the two halves", () => {
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    expect(getSnapshot().sessions[0]?.status).toBe("ok");
    emitToSeam(
      seam,
      searchObservation(productRoute, [], { status: "pending" }),
    );
    expect(getSnapshot().sessions[0]?.status).toBe("pending");
    unsubscribe();
  });
});

describe("change stamps (DT18)", () => {
  it("increments only when a key's parsed value changes", () => {
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      searchObservation(productRoute, [["page", "2"]], {
        data: { page: 2 },
        status: "success",
      }),
    );
    expect(getSnapshot().sessions[0]?.changeStamps.search.page).toBeUndefined();
    emitToSeam(
      seam,
      searchObservation(productRoute, [["page", "2"]], {
        data: { page: 2 },
        status: "success",
      }),
    );
    expect(getSnapshot().sessions[0]?.changeStamps.search.page).toBeUndefined();
    emitToSeam(
      seam,
      searchObservation(productRoute, [["page", "3"]], {
        data: { page: 3 },
        status: "success",
      }),
    );
    expect(getSnapshot().sessions[0]?.changeStamps.search.page).toBe(1);
    unsubscribe();
  });

  it("keeps params and search stamps independent for a same-named key", () => {
    // Legal on App Router (PR9 forbids the collision only for pages routes):
    // `?id=` on /item/[id] is a separate data source from the path param.
    const itemRoute = defineAppRoute("/item/[id]", {
      params: { id: p.integer() },
      search: { id: p.integer().default(0) },
    });
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        itemRoute,
        { id: "1" },
        { data: { id: 1 }, status: "success" },
      ),
    );
    emitToSeam(
      seam,
      searchObservation(itemRoute, [], { data: { id: 0 }, status: "success" }),
    );
    emitToSeam(
      seam,
      paramsObservation(
        itemRoute,
        { id: "2" },
        { data: { id: 2 }, status: "success" },
      ),
    );
    const session = getSnapshot().sessions[0];
    expect(session?.changeStamps.params.id).toBe(1);
    // The search-side id never changed — its row must not flash.
    expect(session?.changeStamps.search.id).toBeUndefined();
    unsubscribe();
  });
});

describe("current-URL matching (DT10)", () => {
  it("marks sessions whose pattern matches the pathname as current", () => {
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    emitToSeam(
      seam,
      paramsObservation(shopRoute, {}, { data: {}, status: "success" }),
    );
    expect(getSnapshot().currentKeys).toEqual(["app:/product/[id]"]);
    unsubscribe();
  });

  it("recomputes currentKeys when the URL commits via history.pushState", () => {
    // Hooks emit render-phase BEFORE Next commits the URL (pushState fires
    // no popstate), so the observation carries the NEW pathname while the
    // emit-time recompute still sees the OLD one; the pushState commit
    // itself must move currentKeys or the live page renders as a stale
    // snapshot with editing disabled.
    setUrl("/shop");
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
        { pathname: "/product/42" },
      ),
    );
    expect(getSnapshot().currentKeys).toEqual([]);
    window.history.pushState(null, "", "/product/42");
    expect(getSnapshot().currentKeys).toEqual(["app:/product/[id]"]);
    unsubscribe();
  });

  it("marks the session stale when the URL moves with NO fresh observation", () => {
    // /product/1 → /product/2 where no hook re-emitted: the pattern still
    // matches, but the retained navigate belongs to /product/1 — committing
    // an edit would silently navigate back to the old resource. Currency
    // must track the last OBSERVED pathname, not the pattern.
    setUrl("/product/1");
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "1" },
        { data: { id: 1 }, status: "success" },
      ),
    );
    expect(getSnapshot().currentKeys).toEqual(["app:/product/[id]"]);
    window.history.pushState(null, "", "/product/2");
    expect(getSnapshot().currentKeys).toEqual([]);
    unsubscribe();
  });

  it("matches through a Next basePath prefix the hooks never see", () => {
    // With `basePath: '/docs'` the location reads /docs/product/42 while
    // the hooks (usePathname / asPath) — and so the observations — are
    // basePath-relative. Matching must not require the panel to know the
    // prefix.
    setUrl("/docs/product/42?page=2");
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
        { pathname: "/product/42" },
      ),
    );
    expect(getSnapshot().currentKeys).toEqual(["app:/product/[id]"]);
    unsubscribe();
  });

  it("a root-route observation stays current under a LEARNED basePath prefix", () => {
    // "/" carries no suffix to align on, so the prefix must come from an
    // earlier non-root match.
    setUrl("/docs/product/42");
    const seam = freshSeam();
    const rootRoute = defineAppRoute("/", {});
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
        { pathname: "/product/42" },
      ),
    );
    expect(getSnapshot().currentKeys).toEqual(["app:/product/[id]"]);
    emitToSeam(
      seam,
      paramsObservation(
        rootRoute,
        {},
        { data: {}, status: "success" },
        { pathname: "/" },
      ),
    );
    window.history.pushState(null, "", "/docs");
    expect(getSnapshot().currentKeys).toEqual(["app:/"]);
    unsubscribe();
  });

  it("restores the original history methods when the last subscriber leaves", () => {
    /* eslint-disable @typescript-eslint/unbound-method -- identity comparison of the restored methods; nothing here invokes them */
    freshSeam();
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const unsubscribe = subscribe(() => undefined);
    unsubscribe();
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it("detach leaves a LATER patcher's history wrapper installed (no ABA restore)", () => {
    /* eslint-disable @typescript-eslint/unbound-method -- identity comparison of patched methods; nothing here invokes them */
    freshSeam();
    const originalPushState = window.history.pushState;
    const unsubscribe = subscribe(() => undefined);
    // A library (lazy-loaded analytics, another devtools plugin) patching
    // AFTER the panel attached: detach must not sever it by blindly
    // restoring the attach-time function.
    const laterPatcher: History["pushState"] = () => undefined;
    window.history.pushState = laterPatcher;
    unsubscribe();
    expect(window.history.pushState).toBe(laterPatcher);
    window.history.pushState = originalPushState;
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});

describe("navigate freshness (DT8)", () => {
  it("the session-level navigate is the NEWEST observation's, regardless of half", () => {
    // The search half's closure can go stale while the params half re-emits
    // (its fingerprint includes the id); a half-preferring pick would keep
    // routing edits through the stale one.
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    const searchNavigate = vi.fn();
    const paramsNavigate = vi.fn();
    emitToSeam(
      seam,
      searchObservation(
        productRoute,
        [["page", "2"]],
        { data: { page: 2 }, status: "success" },
        { navigate: searchNavigate },
      ),
    );
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
        { navigate: paramsNavigate },
      ),
    );
    expect(getSnapshot().sessions[0]?.navigate).toBe(paramsNavigate);
    unsubscribe();
  });
});

describe("snapshot stability", () => {
  it("a history commit that changes nothing keeps the snapshot identity", () => {
    // Next apps churn replaceState (scroll restoration etc.); minting a new
    // snapshot each time defeats useSyncExternalStore's bailout and
    // re-renders the whole panel per commit.
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    emitToSeam(
      seam,
      paramsObservation(
        productRoute,
        { id: "42" },
        { data: { id: 42 }, status: "success" },
      ),
    );
    const before = getSnapshot();
    window.history.replaceState(null, "", "/product/42?page=2");
    expect(getSnapshot()).toBe(before);
    unsubscribe();
  });
});

describe("re-attach (DT5/DT10)", () => {
  it("does not replay already-consumed observations into retained sessions", () => {
    const seam = freshSeam();
    const first = subscribe(() => undefined);
    emitToSeam(
      seam,
      searchObservation(productRoute, [["page", "2"]], {
        data: { page: 2 },
        status: "success",
      }),
    );
    emitToSeam(
      seam,
      searchObservation(productRoute, [["page", "3"]], {
        data: { page: 3 },
        status: "success",
      }),
    );
    expect(getSnapshot().sessions[0]?.changeStamps.search.page).toBe(1);
    first();

    // Panel closed and reopened: sessions are retained (DT10), the buffer
    // still holds both observations — replay must not re-walk history and
    // inflate the stamps (re-flashing rows that did not change).
    const second = subscribe(() => undefined);
    expect(getSnapshot().sessions).toHaveLength(1);
    expect(getSnapshot().sessions[0]?.changeStamps.search.page).toBe(1);
    second();
  });
});

describe("lifecycle", () => {
  it("detaches from the seam at zero subscribers", () => {
    const seam = freshSeam();
    const unsubscribe = subscribe(() => undefined);
    expect(seam.listeners.size).toBe(1);
    unsubscribe();
    expect(seam.listeners.size).toBe(0);
  });

  it("getServerSnapshot is the constant empty snapshot (SSR safety)", () => {
    expect(getServerSnapshot()).toBe(getServerSnapshot());
    expect(getServerSnapshot().sessions).toEqual([]);
  });
});
