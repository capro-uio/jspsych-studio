import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./apps/studio/svelte.config.js";

export default ts.config(
  { ignores: ["**/dist/", "**/node_modules/"] },
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      // Destructuring a field away to drop it is how the codebase omits one; the name says so.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser, svelteConfig } },
    rules: {
      // Every Set and Map in the builder is a lookup or a cache that must not trigger effects;
      // state is reactive through $state, which this rule cannot tell apart from a plain Set.
      "svelte/prefer-svelte-reactivity": "off",
    },
  },
  {
    // The template parser cannot follow types through markup that svelte-check does, so it reports
    // typed values as `any`; svelte-check is the type check for components, and runs in CI.
    files: ["**/*.svelte"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["**/*.js"],
    extends: [ts.configs.disableTypeChecked],
  },
);
