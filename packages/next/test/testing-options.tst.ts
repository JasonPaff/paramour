/**
 * Type-level tests for `@paramour-js/next/testing`'s options bag (design-16
 * TA5/TA6). Pins the compile-time claims the runtime suite
 * (testing.test.tsx) cannot express, under the repo's real compiler
 * settings — `exactOptionalPropertyTypes` is the one that bites:
 *
 *  1. Every field is optional: `{}` is accepted and the whole argument to
 *     `withParamourTesting` is omittable; each field is independently
 *     assignable.
 *  2. Optional means OMITTABLE, not `| undefined`: an explicit
 *     `field: undefined` is a COMPILE ERROR for every field. The adapters
 *     key on omission (`params` omitted → `{}`, while `params: null` is the
 *     hybrid-app state), so "present but undefined" must not typecheck.
 *  3. `params` accepts `null` AND a `ParamsSource`; `search` accepts a
 *     string AND a `URLSearchParams`.
 *  4. `withParamourTesting()` returns a wrapper shaped for testing-library's
 *     `wrapper` option; the provider's props are the options plus
 *     `children`.
 *
 * Plain .ts (not .tsx): the provider and wrapper are ordinary functions at
 * the type level, no JSX needed.
 */
import { expect, test } from "tstyche";
import type { ParamsSource } from "paramour";
import type { ReactElement, ReactNode } from "react";

import type { ParamourTestingOptions } from "../src/testing.js";

import {
  ParamourTestingProvider,
  withParamourTesting,
} from "../src/testing.js";

test("{} is assignable and the whole argument is omittable (TA6)", () => {
  expect({}).type.toBeAssignableTo<ParamourTestingOptions>();
  expect(withParamourTesting).type.toBeCallableWith();
  expect(withParamourTesting).type.toBeCallableWith({});
});

test("each field is individually assignable (TA6)", () => {
  expect({ isReady: false }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({ mounted: false }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    onReplace: (href: string) => void href,
  }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    params: { id: "42" },
  }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    pathname: "/product/42",
  }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({ search: "page=2" }).type.toBeAssignableTo<ParamourTestingOptions>();
});

test("params accepts null AND a ParamsSource AND omission (TA6)", () => {
  expect({ params: null }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    params: { id: "42", slug: ["a", "b"] },
  }).type.toBeAssignableTo<ParamourTestingOptions>();
  const source: ParamsSource = { id: "42" };
  expect({ params: source }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect(withParamourTesting).type.toBeCallableWith({ params: null });
});

test("search accepts a string AND a URLSearchParams (TA6)", () => {
  expect({ search: "?page=2" }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({ search: "page=2" }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    search: new URLSearchParams("page=2"),
  }).type.toBeAssignableTo<ParamourTestingOptions>();
  expect({ search: 2 }).type.not.toBeAssignableTo<ParamourTestingOptions>();
});

test("explicit undefined is rejected for every field (exactOptionalPropertyTypes)", () => {
  expect({
    isReady: undefined,
  }).type.not.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    mounted: undefined,
  }).type.not.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    onReplace: undefined,
  }).type.not.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    params: undefined,
  }).type.not.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    pathname: undefined,
  }).type.not.toBeAssignableTo<ParamourTestingOptions>();
  expect({
    search: undefined,
  }).type.not.toBeAssignableTo<ParamourTestingOptions>();
  expect(withParamourTesting).type.not.toBeCallableWith({
    pathname: undefined,
  });
  expect(ParamourTestingProvider).type.not.toBeCallableWith({
    search: undefined,
  });
});

test("withParamourTesting returns a testing-library-shaped wrapper (TA5)", () => {
  expect(withParamourTesting()).type.toBe<
    (props: { children?: ReactNode }) => ReactElement
  >();
  expect(withParamourTesting({ pathname: "/" })).type.toBe<
    (props: { children?: ReactNode }) => ReactElement
  >();
});

test("provider props accept children alongside every option (TA5)", () => {
  expect(ParamourTestingProvider).type.toBeCallableWith({});
  expect(ParamourTestingProvider).type.toBeCallableWith({ children: "child" });
  expect(ParamourTestingProvider).type.toBeCallableWith({
    children: "child",
    isReady: true,
    mounted: true,
    onReplace: (href: string) => void href,
    params: null,
    pathname: "/product/42",
    search: new URLSearchParams("page=2"),
  });
});
