import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

/**
 * Flat config, migrated from .eslintrc.json when ESLint 8 went end of life.
 *
 * This is a like-for-like translation: the same shared configs, the same
 * rules, the same per-directory environments. Nothing new is switched on, so
 * the codebase lints exactly as it did before — a migration that also changed
 * the rules would make it impossible to tell a real regression from config
 * churn.
 *
 * Flat config has no `--ext`: the `files` patterns below decide what `eslint .`
 * looks at, which is why `**\/*.jsx` has to be named explicitly (ESLint only
 * picks up .js/.mjs/.cjs on its own).
 */
export default [
  {
    // Replaces "ignorePatterns". node_modules is ignored by default in flat config.
    ignores: ["dist/", "coverage/"],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    ...js.configs.recommended,
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    ...react.configs.flat.recommended,
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    ...react.configs.flat["jsx-runtime"],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/prop-types": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],
      /**
       * ESLint 9 added this to eslint:recommended. It is the one rule whose
       * verdict differs between 8 and 9 on this codebase — it objects to the
       * defensive `let exitCode = 0` initialiser in scripts/rbac/run.mjs — so
       * it is off to keep the migration behaviour-neutral. Turning it on is a
       * deliberate, separate decision.
       */
      "no-useless-assignment": "off",
    },
  },
  {
    // Build and maintenance scripts run under Node, and are expected to talk.
    files: [
      "scripts/**/*.mjs",
      "scripts/**/*.js",
      "scripts/**/*.cjs",
      "*.config.js",
      "vite.config.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["public/sw.js"],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    // Tests run in Node, and the suite-level globals stay declared here even
    // though every test file imports them from vitest explicitly.
    files: ["**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
      },
    },
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    ...prettier,
  },
];
