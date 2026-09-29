import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import { noImpureValueDefaults } from "../src/rules/no-impure-value-defaults.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

const P = `import { p } from "paramour";\n`;

/**
 * An invalid case whose single report suggests wrapping `argument` (its last
 * occurrence in `code` as a call argument) in a factory.
 */
function flagged(code: string, argument: string) {
  const at = code.lastIndexOf(`(${argument})`);
  const output = `${code.slice(0, at)}(() => ${argument})${code.slice(at + argument.length + 2)}`;
  return {
    code,
    errors: [
      {
        messageId: "impureDefault" as const,
        suggestions: [{ messageId: "useFactory" as const, output }],
      },
    ],
  };
}

ruleTester.run("no-impure-value-defaults", noImpureValueDefaults, {
  invalid: [
    // The canonical case: new Date() frozen at module load
    {
      code: `${P}export const since = p.timestamp().default(new Date());`,
      errors: [
        {
          data: { impure: "new Date()" },
          messageId: "impureDefault",
          suggestions: [
            {
              messageId: "useFactory",
              output: `${P}export const since = p.timestamp().default(() => new Date());`,
            },
          ],
        },
      ],
    },
    // .catch() fallbacks freeze just the same
    {
      code: `${P}export const at = p.timestamp().catch(new Date());`,
      errors: [
        {
          data: { impure: "new Date()" },
          messageId: "impureCatch",
          suggestions: [
            {
              messageId: "useFactory",
              output: `${P}export const at = p.timestamp().catch(() => new Date());`,
            },
          ],
        },
      ],
    },
    // Every allowlisted construct
    ...[
      "Date.now()",
      "Date()",
      "Math.random()",
      "performance.now()",
      "crypto.randomUUID()",
      "Temporal.Now.instant()",
      "Temporal.Now.plainDateISO()",
    ].map((impure) => ({
      code: `${P}export const c = p.number().default(${impure});`,
      errors: [
        {
          data: { impure },
          messageId: "impureDefault" as const,
          suggestions: [
            {
              messageId: "useFactory" as const,
              output: `${P}export const c = p.number().default(() => ${impure});`,
            },
          ],
        },
      ],
    })),
    // Impure anywhere inside the argument
    {
      code: `${P}const DAY = 86_400_000;\nexport const c = p.number().default(Date.now() - DAY);`,
      errors: [
        {
          data: { impure: "Date.now()" },
          messageId: "impureDefault",
          suggestions: [
            {
              messageId: "useFactory",
              output: `${P}const DAY = 86_400_000;\nexport const c = p.number().default(() => Date.now() - DAY);`,
            },
          ],
        },
      ],
    },
    {
      code: `${P}export const c = p.string().default(new Date().toISOString());`,
      errors: [
        {
          data: { impure: "new Date()" },
          messageId: "impureDefault",
          suggestions: [
            {
              messageId: "useFactory",
              output: `${P}export const c = p.string().default(() => new Date().toISOString());`,
            },
          ],
        },
      ],
    },
    // Object-literal argument is parenthesized in the factory body
    {
      code: `${P}export const c = p.json(s).default({ at: Date.now() });`,
      errors: [
        {
          data: { impure: "Date.now()" },
          messageId: "impureDefault",
          suggestions: [
            {
              messageId: "useFactory",
              output: `${P}export const c = p.json(s).default(() => ({ at: Date.now() }));`,
            },
          ],
        },
      ],
    },
    // Aliased and namespace imports of p
    flagged(
      `import { p as codec } from "paramour";\nexport const c = codec.timestamp().default(new Date());`,
      "new Date()",
    ),
    flagged(
      `import * as pm from "paramour";\nexport const c = pm.p.timestamp().default(new Date());`,
      "new Date()",
    ),
    // Chain walks back through intermediate modifiers
    flagged(
      `${P}export const c = p.timestamp().catch(() => new Date()).default(new Date());`,
      "new Date()",
    ),
    // Inside a route config
    flagged(
      `import { defineAppRoute, p } from "paramour";
export const route = defineAppRoute("/feed", {
  search: { seed: p.number().default(Math.random()) },
});`,
      "Math.random()",
    ),
    // node:crypto default and namespace imports count as crypto
    flagged(
      `${P}import crypto from "node:crypto";\nexport const c = p.string().default(crypto.randomUUID());`,
      "crypto.randomUUID()",
    ),
    flagged(
      `${P}import * as crypto from "crypto";\nexport const c = p.string().default(crypto.randomUUID());`,
      "crypto.randomUUID()",
    ),
  ],
  valid: [
    // Factory forms
    `${P}export const c = p.timestamp().default(() => new Date());`,
    `${P}export const c = p.timestamp().catch(() => new Date());`,
    `${P}export const c = p.number().default(function () { return Date.now(); });`,
    // Pure values and pure conversions
    `${P}export const c = p.timestamp().default(new Date("2020-01-01T00:00:00Z"));`,
    `${P}export const c = p.timestamp().default(new Date(0));`,
    `${P}export const c = p.integer().default(1);`,
    `${P}export const c = p.number().default(Math.max(1, 2));`,
    // Unrelated builders with their own .default()
    `import { z } from "zod";\nexport const s = z.date().default(new Date());`,
    `export const c = builder.timestamp().default(new Date());`,
    // p from somewhere else
    `import { p } from "./local";\nexport const c = p.timestamp().default(new Date());`,
    // Type-only import of p
    `import type { p } from "paramour";\nexport const c = p.timestamp().default(new Date());`,
    // Shadowed globals
    `${P}class Date { static now() { return 1; } }\nexport const c = p.number().default(Date.now());`,
    `${P}const Math = { random: () => 4 };\nexport const c = p.number().default(Math.random());`,
    `${P}import crypto from "./my-crypto";\nexport const c = p.string().default(crypto.randomUUID());`,
    // Promise.catch and other non-codec catch calls
    `fetch("/x").catch(new Date());`,
    // Spread and multi-argument calls are not the codec signature
    `${P}declare const args: [Date];\nexport const c = p.timestamp().default(...args);`,
  ],
});
