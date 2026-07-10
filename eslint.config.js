import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
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
      "docs/**",
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
