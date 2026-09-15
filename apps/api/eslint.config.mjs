import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * ESLint flat config for the API.
 *
 * Deliberately not type-aware (`recommendedTypeChecked`): those rules need a
 * full program per run, which roughly triples lint time, and `pnpm typecheck`
 * already runs the compiler over the same files in CI. This config is here to
 * catch the things tsc does not — unused code, accidental `any`, floating
 * `case` fallthrough — and to stay fast enough to run on every save.
 */
export default tseslint.config(
  {
    // Build output and the generated Prisma client are not ours to lint.
    ignores: ["dist/**", "coverage/**", "node_modules/**", "**/*.js"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      // TypeScript resolves globals and imports itself, and does it better —
      // leaving this on means declaring every Node and DOM global by hand.
      "no-undef": "off",

      // An underscore prefix is how this codebase marks a parameter that must
      // stay in the signature but is not read, e.g. the `_res` a Nest
      // middleware receives.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],

      // Non-null assertions are load-bearing here: a route behind JwtAuthGuard
      // or ApiKeyGuard always has req.tenantContext, and the guard is what
      // proves it — the type system cannot.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",

      // Nest's DI decorators and Prisma's generated types produce plenty of
      // empty interfaces and namespaces that are not worth rewriting.
      "@typescript-eslint/no-empty-object-type": "off",

      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  {
    // Tests reach for fixtures and partial objects that would otherwise trip
    // the stricter rules; the assertions are the point, not the typing.
    files: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
);
