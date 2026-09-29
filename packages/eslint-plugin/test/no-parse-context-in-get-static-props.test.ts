import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import { noParseContextInGetStaticProps } from "../src/rules/no-parse-context-in-get-static-props.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

const ROUTE = `import { productRoute } from "./route.def";\n`;

ruleTester.run(
  "no-parse-context-in-get-static-props",
  noParseContextInGetStaticProps,
  {
    invalid: [
      // Exported function declaration
      {
        code: `${ROUTE}export async function getStaticProps(ctx) {
  const { params } = productRoute.parseContext(ctx);
  return { props: { params } };
}`,
        errors: [
          {
            data: { method: "parseContext", replacement: "decodeParams" },
            messageId: "parseContextInGetStaticProps",
          },
        ],
      },
      // Arrow function, safe variant → safeDecodeParams
      {
        code: `${ROUTE}export const getStaticProps = async (ctx) => {
  const result = productRoute.safeParseContext(ctx);
  return { props: {} };
};`,
        errors: [
          {
            data: {
              method: "safeParseContext",
              replacement: "safeDecodeParams",
            },
            messageId: "parseContextInGetStaticProps",
          },
        ],
      },
      // TS wrappers around the initializer
      {
        code: `${ROUTE}import type { GetStaticProps } from "next";
export const getStaticProps = (async (ctx) => {
  productRoute.parseContext(ctx);
  return { props: {} };
}) satisfies GetStaticProps;`,
        errors: [{ messageId: "parseContextInGetStaticProps" }],
      },
      {
        code: `${ROUTE}import type { GetStaticProps } from "next";
export const getStaticProps: GetStaticProps = async function (ctx) {
  productRoute.parseContext(ctx);
  return { props: {} };
};`,
        errors: [{ messageId: "parseContextInGetStaticProps" }],
      },
      // Declared, then exported by specifier
      {
        code: `${ROUTE}async function getStaticProps(ctx) {
  productRoute.parseContext(ctx);
  return { props: {} };
}
export { getStaticProps };`,
        errors: [{ messageId: "parseContextInGetStaticProps" }],
      },
      // Nested helpers and optional-chained calls
      {
        code: `${ROUTE}export async function getStaticProps(ctx) {
  const read = () => productRoute?.parseContext(ctx);
  return { props: { value: read() } };
}`,
        errors: [{ messageId: "parseContextInGetStaticProps" }],
      },
    ],
    valid: [
      // The documented replacement
      `import { safeDecodeParams } from "paramour";
${ROUTE}export async function getStaticProps(ctx) {
  const result = safeDecodeParams(productRoute, ctx.params ?? {});
  return { props: {} };
}`,
      // getServerSideProps is the supported home for parseContext
      `${ROUTE}export async function getServerSideProps(ctx) {
  productRoute.parseContext(ctx);
  return { props: {} };
}`,
      // Outside getStaticProps in the same file
      `${ROUTE}export function helper(ctx) { return productRoute.parseContext(ctx); }
export async function getStaticProps() { return { props: {} }; }`,
      // A nested (non-module-level) function named getStaticProps
      `${ROUTE}export function make() {
  function getStaticProps(ctx) { return productRoute.parseContext(ctx); }
  return getStaticProps;
}`,
    ],
  },
);
