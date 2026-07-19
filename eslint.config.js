import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // *.tst.* type tests contain intentional type errors and are checked
    // by tstyche, not by tsc or ESLint's project service (same glob as the
    // tstyche configs' testFileMatch).
    ignores: [
      "**/dist/**",
      "**/*.tst.*",
      "coverage/**",
      "examples/**",
      "docs/.next/**",
      "docs/.source/**",
      "**/next-env.d.ts",
      "**/paramour-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  perfectionist.configs["recommended-natural"],

  // Package sources and tests: full type-checked rules.
  {
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    files: ["packages/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // The docs site is a first-class workspace (design-14 DS2): same
  // type-checked bar as the packages.
  {
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    files: ["docs/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Tailwind class hygiene for the docs site (plan-docs-milestone-5
  // decision 4): classes are checked against the real Tailwind 4 entry css,
  // so unknown/conflicting/duplicate utilities are errors; the stylistic
  // rules (class order, whitespace) stay warnings with autofix.
  {
    extends: [betterTailwindcss.configs["recommended-warn"]],
    files: ["docs/**/*.{ts,tsx}"],
    rules: {
      // Wrapping every long class list into multi-line template literals is
      // churn without a readability win at this codebase's class lengths.
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-unknown-classes": "error",
    },
    settings: {
      "better-tailwindcss": { entryPoint: "docs/app/global.css" },
    },
  },

  // Root-level TS config files (vitest.config.ts, etc.): no type info needed.
  {
    extends: [tseslint.configs.recommended],
    files: ["*.ts"],
  },

  // Committed bin stubs: plain Node ESM outside the TS projects, so the
  // type-checked blocks never see them; declare the Node globals they use.
  {
    files: ["packages/*/bin/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },

  prettier,
);
