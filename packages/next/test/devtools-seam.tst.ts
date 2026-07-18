/**
 * Type-level tests for the devtools seam contract (design-12 DT4/DT5/DT12)
 * — the design's "seam types exercised from the next package's suite". The
 * devtools package consumes these same types via the types-only
 * `@paramour-js/next/devtools-seam` subpath, so what's pinned here is the
 * cross-package contract.
 */
import type { SafeResult } from "paramour";

import { expect, test } from "tstyche";

import type {
  ParamourDevtoolsSeam,
  ParamourHookId,
  ParamourObservation,
  ParamourParamsObservation,
  ParamourSearchObservation,
  ParamourSearchWire,
} from "../src/devtools-seam.js";

declare const observation: ParamourObservation;
declare const seam: ParamourDevtoolsSeam;
declare const typedResult: SafeResult<{ page: number }>;

test("kind discriminates the wire shape (params record vs search pairs)", () => {
  if (observation.kind === "params") {
    expect(observation).type.toBeAssignableTo<ParamourParamsObservation>();
    expect(observation.wire).type.toBeAssignableTo<
      Readonly<Record<string, string | string[] | undefined>>
    >();
  }
  if (observation.kind === "search") {
    expect(observation).type.toBeAssignableTo<ParamourSearchObservation>();
    expect(observation.wire).type.toBe<ParamourSearchWire>();
  }
});

test("status narrows the result three ways (DT11/DT12)", () => {
  const { result } = observation;
  if (result.status === "success") {
    expect(result.data).type.toBe<unknown>();
  }
  if (result.status === "error") {
    expect(result.error.issues).type.toBeAssignableTo<
      readonly { key: string; message: string }[]
    >();
  }
  if (result.status === "pending") {
    expect(result).type.not.toHaveProperty("data");
    expect(result).type.not.toHaveProperty("error");
  }
});

test("ParamourHookId is exactly the six hook literals (Pages has no OrThrow, PR6)", () => {
  expect<ParamourHookId>().type.toBe<
    | "app.useRouteParams"
    | "app.useRouteParamsOrThrow"
    | "app.useSearch"
    | "app.useSearchOrThrow"
    | "pages.useRouteParams"
    | "pages.useSearch"
  >();
});

test("the slot's version is the literal 1 (skew guard)", () => {
  expect(seam.version).type.toBe<1>();
});

test("a concretely-typed result still fits: the shape is generic-erased (DT12)", () => {
  expect(typedResult).type.toBeAssignableTo<ParamourObservation["result"]>();
});
