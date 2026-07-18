/**
 * Type-level tests for the package's public surface (design-12): panel
 * props under exactOptionalPropertyTypes, the plugin helper's return shape,
 * and — the load-bearing one — assignability of the structurally-declared
 * plugin entry to the REAL `@tanstack/react-devtools` plugins prop (the
 * reason the shell is a devDependency here).
 */
import type { ComponentProps, JSX, ReactElement } from "react";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { expect, test } from "tstyche";

import {
  ParamourDevtoolsPanel,
  type ParamourDevtoolsPanelProps,
  paramourDevtoolsPlugin,
  type ParamourDevtoolsPluginEntry,
} from "../src/index.js";

type ShellPlugins = ComponentProps<typeof TanStackDevtools>["plugins"];
type ShellPlugin = NonNullable<ShellPlugins>[number];

test("panel props: theme is an optional 'dark' | 'light'", () => {
  expect<{
    theme: "dark";
  }>().type.toBeAssignableTo<ParamourDevtoolsPanelProps>();
  expect<{
    theme: "light";
  }>().type.toBeAssignableTo<ParamourDevtoolsPanelProps>();
  // Optional: the bare object is fine (the shell may omit it).
  expect<
    Record<never, never>
  >().type.toBeAssignableTo<ParamourDevtoolsPanelProps>();
  expect<{
    theme: "auto";
  }>().type.not.toBeAssignableTo<ParamourDevtoolsPanelProps>();
});

test("panel is a valid JSX component with and without theme", () => {
  expect(<ParamourDevtoolsPanel />).type.toBeAssignableTo<JSX.Element>();
  expect(
    <ParamourDevtoolsPanel theme="dark" />,
  ).type.toBeAssignableTo<JSX.Element>();
});

test("plugin helper returns the entry shape", () => {
  expect(paramourDevtoolsPlugin()).type.toBe<ParamourDevtoolsPluginEntry>();
  expect(
    paramourDevtoolsPlugin({ defaultOpen: true }),
  ).type.toBe<ParamourDevtoolsPluginEntry>();
  expect(paramourDevtoolsPlugin().render).type.toBeAssignableTo<ReactElement>();
});

test("the entry is assignable to the REAL shell's plugins array (DT1/DT13)", () => {
  expect(paramourDevtoolsPlugin()).type.toBeAssignableTo<ShellPlugin>();
  expect([paramourDevtoolsPlugin()]).type.toBeAssignableTo<
    NonNullable<ShellPlugins>
  >();
});
