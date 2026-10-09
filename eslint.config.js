import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      // machine-generated bundle: rewritten by the @lovable.dev/mcp-js build plugin ("do not edit")
      "supabase/functions/mcp/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // The project predates this rule: well over a hundred existing `any`s (mostly query results in
      // the admin screens). Kept visible as warnings instead of blocking every change; new code in
      // the payment/order/auth paths is fully typed.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
