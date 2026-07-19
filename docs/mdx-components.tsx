import type { MDXComponents } from "mdx/types";

import * as Twoslash from "fumadocs-twoslash/ui";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";

import { CodecWireTable } from "@/components/codec-wire-table";
import { Rule } from "@/components/rule";
import { WireExample } from "@/components/wire-example";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...Twoslash,
    CodecWireTable,
    Rule,
    Tab,
    Tabs,
    WireExample,
    ...components,
  };
}
