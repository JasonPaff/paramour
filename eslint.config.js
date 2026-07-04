import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "coverage/**", "examples/**", "docs/**"],
  },
  eslint.configs.recommended,
  perfectionist.configs["recommended-natural"],

  // Package sources and tests: full type-checked rules.
  {
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    files: ["packages/**/*.ts"],
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

  prettier,
);
