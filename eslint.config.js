import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import lawsConfig from "./eslint.laws.config.js";

export default tseslint.config(
  { ignores: ["dist"] },
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
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node-run render scripts spawned by tests (TZ must be set at process start).
    files: ["**/*.fixture.tsx"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "react-refresh/only-export-components": "off", "@typescript-eslint/ban-ts-comment": "off" },
  },
  // --- ARCH-2065: the architectural laws (L37 boundaries + L38/V3b view law). Defined once in
  // eslint.laws.config.js, which is also what `bun run build` runs on its own.
  ...lawsConfig,
);
