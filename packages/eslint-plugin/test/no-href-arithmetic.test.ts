import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import { noHrefArithmetic } from "../src/rules/no-href-arithmetic.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-href-arithmetic", noHrefArithmetic, {
  invalid: [
    // Hash suffix — the autofixable shape
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route) + "#top";`,
      errors: [{ data: { suffix: "#top" }, messageId: "hrefHashConcat" }],
      output: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { hash: "top" });`,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = \`\${href(route)}#top\`;`,
      errors: [{ data: { suffix: "#top" }, messageId: "hrefHashConcat" }],
      output: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { hash: "top" });`,
    },
    // Existing options object: hash is inserted first (perfectionist order)
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { params: { id: 1 } }) + "#reviews";`,
      errors: [{ data: { suffix: "#reviews" }, messageId: "hrefHashConcat" }],
      output: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { hash: "reviews", params: { id: 1 } });`,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route, {}) + "#a";`,
      errors: [{ data: { suffix: "#a" }, messageId: "hrefHashConcat" }],
      output: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { hash: "a" });`,
    },
    // Namespace and aliased import forms fix too
    {
      code: `import * as pm from "paramour";
declare const route: object;
export const url = pm.href(route) + "#x";`,
      errors: [{ data: { suffix: "#x" }, messageId: "hrefHashConcat" }],
      output: `import * as pm from "paramour";
declare const route: object;
export const url = pm.href(route, { hash: "x" });`,
    },
    {
      code: `import { href as h } from "paramour";
declare const route: object;
export const url = h(route) + "#a";`,
      errors: [{ data: { suffix: "#a" }, messageId: "hrefHashConcat" }],
      output: `import { href as h } from "paramour";
declare const route: object;
export const url = h(route, { hash: "a" });`,
    },
    // Fixes inside JSX expression containers
    {
      code: `import { href } from "paramour";
declare const route: object;
export const el = <a href={href(route) + "#top"} />;`,
      errors: [{ data: { suffix: "#top" }, messageId: "hrefHashConcat" }],
      output: `import { href } from "paramour";
declare const route: object;
export const el = <a href={href(route, { hash: "top" })} />;`,
    },
    // Fixes are shape-local: the template fix lands in one pass; the "?b"
    // still concatenated afterward surfaces on the next lint pass — standard
    // ESLint fixpoint behavior.
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = \`\${href(route)}#a\` + "?b";`,
      errors: [{ data: { suffix: "#a" }, messageId: "hrefHashConcat" }],
      output: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { hash: "a" }) + "?b";`,
    },
    // Query suffixes teach the search option — never autofixed (the appended
    // params need codec keys)
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route) + "?tab=1";`,
      errors: [{ data: { suffix: "?tab=1" }, messageId: "hrefSearchConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = \`\${href(route)}?page=2\`;`,
      errors: [{ data: { suffix: "?page=2" }, messageId: "hrefSearchConcat" }],
      output: null,
    },
    // Dynamic or multi-part suffixes get the generic message
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const suffix: string;
export const url = href(route) + suffix;`,
      errors: [{ messageId: "hrefConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const child: string;
export const url = \`\${href(route)}/\${child}\`;`,
      errors: [{ messageId: "hrefConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const x: string;
export const url = href(route) + "#a" + x;`,
      errors: [{ messageId: "hrefConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const frag: string;
export const url = \`\${href(route)}#\${frag}\`;`,
      errors: [{ messageId: "hrefConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const a: object;
declare const b: object;
export const url = href(a) + href(b);`,
      errors: [{ messageId: "hrefConcat" }],
      output: null,
    },
    // Hash suffix, but the chain isn't exactly call-plus-literal — no fix
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const x: string;
export const url = x + href(route) + "#t";`,
      errors: [{ data: { suffix: "#t" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const origin: string;
export const url = \`\${origin}\${href(route)}#top\`;`,
      errors: [{ data: { suffix: "#top" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = \`\${href(route)}\` + "#top";`,
      errors: [{ data: { suffix: "#top" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    // Fixer bail-outs: existing hash, spread, non-object options, trailing
    // comma, comments outside the call
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route, { hash: "a" }) + "#b";`,
      errors: [{ data: { suffix: "#b" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const opts: object;
export const url = href(route, { ...opts }) + "#b";`,
      errors: [{ data: { suffix: "#b" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
declare const opts: object;
export const url = href(route, opts) + "#b";`,
      errors: [{ data: { suffix: "#b" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route,) + "#a";`,
      errors: [{ data: { suffix: "#a" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route) /* keep */ + "#a";`,
      errors: [{ data: { suffix: "#a" }, messageId: "hrefHashConcat" }],
      output: null,
    },
    // A bare "#" appends an empty fragment — generic, nothing to derive
    {
      code: `import { href } from "paramour";
declare const route: object;
export const url = href(route) + "#";`,
      errors: [{ messageId: "hrefConcat" }],
      output: null,
    },
  ],
  valid: [
    // Prefix-only concatenation is the legitimate absolute-URL pattern
    `import { href } from "paramour";
declare const route: object;
export const url = "https://example.com" + href(route);`,
    `import { href } from "paramour";
declare const route: object;
declare const origin: string;
export const url = \`\${origin}\${href(route)}\`;`,
    // Bare results
    `import { href } from "paramour";
declare const route: object;
export const url = href(route);`,
    `import { href } from "paramour";
declare const route: object;
export const url = \`\${href(route)}\`;`,
    // href from another module — never fires
    `import { href } from "./urls";
declare const route: object;
export const url = href(route) + "#a";`,
    // Shadowed import resolves to the inner binding
    `import { href } from "paramour";
declare const route: object;
export function f() {
  const href = (x: object) => String(x);
  return href(route) + "#a";
}`,
    // Type-only import — a value usage is already a TS error
    `import type { href } from "paramour";
declare const route: object;
export const url = href(route) + "#a";`,
    // Tagged templates have unknown semantics
    `import { href } from "paramour";
declare const route: object;
declare function tag(strings: TemplateStringsArray, ...values: string[]): string;
export const url = tag\`\${href(route)}#top\`;`,
    // Flows the rule deliberately does not follow (LP4 boundary costs)
    `import { href } from "paramour";
declare const route: object;
export const url = href(route).concat("#a");`,
    `import { href } from "paramour";
declare const route: object;
export const url = [href(route), "#a"].join("");`,
    `import { href } from "paramour";
declare const route: object;
const base = href(route);
export const url = base + "#a";`,
    // Non-concatenation operators
    `import { href } from "paramour";
declare const route: object;
declare const x: string;
export const eq = href(route) === x;`,
  ],
});
