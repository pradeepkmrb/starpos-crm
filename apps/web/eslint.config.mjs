import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint flat config for the dashboard.
 *
 * `next lint` is not used: on Next 14 it only reads the legacy .eslintrc
 * format, which ESLint 10 no longer supports, and with no config present it
 * drops into an interactive setup prompt that hangs CI. Running eslint
 * directly against the same plugins gives the same coverage and matches how
 * the API is linted.
 *
 * @next/eslint-plugin-next is intentionally newer than the Next runtime: it is
 * a standalone lint plugin, and the 14.x line predates flat config and calls
 * context.getCwd()/getFilename(), both removed in ESLint 10.
 */
export default tseslint.config(
  {
    ignores: [".next/**", "out/**", "coverage/**", "node_modules/**", "**/*.js"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Only meaningful for the old pages/ router, which this app does not use.
      "@next/next/no-html-link-for-pages": "off",

      // The rule that actually catches bugs in this codebase: a page that
      // fetches in an effect and forgets a dependency renders stale data.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript resolves globals and imports itself, and does it better.
      "no-undef": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-object-type": "off",

      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
);
