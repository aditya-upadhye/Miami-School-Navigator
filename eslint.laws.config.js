/**
 * The LAWS-ONLY lint config (what `bun run build` runs): hexagonal boundaries (L37) + the view law
 * (L38/V3b), nothing else. The generic rule sets (react-hooks v7, typescript-eslint recommended) live
 * in `eslint.config.js` — the developer command, `bun run lint` — and do NOT gate the build: the
 * generated containers and adapters have never been linted under them.
 *
 * `eslint.config.js` spreads this array, so the laws are defined in exactly one place.
 */
import tseslint from "typescript-eslint";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { boundariesConfig } from "./eslint-rules/boundaries/config.js";
import { VIEW_GLOBS, VIEW_IGNORES, viewLawConfig } from "./eslint-rules/archie-view-law/index.js";

export default [
  { ignores: ["dist", "eslint-rules/**/__fixtures__/**"] },
  // Directives for generic rules are unused here by design (those rules only run under `bun run lint`).
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  // Parse TS/TSX. The generic plugins are REGISTERED but no rule is enabled: the code carries
  // `eslint-disable` comments naming their rules, and ESLint errors on a directive for a rule whose
  // definition it cannot find. (Those rules only run under `bun run lint`.)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh, "@typescript-eslint": tseslint.plugin },
  },
  // Parse JS/JSX under src/ (transplanted `*.view.jsx`) for L37 only: no `projectService` (boundaries is
  // not type-aware), JSX enabled. The view law stays on VIEW_GLOBS (`*.{ts,tsx}`).
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh, "@typescript-eslint": tseslint.plugin },
  },
  // The laws cannot be silenced inline: an eslint-disable naming them is itself an error.
  {
    files: ["**/*.{ts,tsx}", "src/**/*.{js,jsx}"],
    plugins: { "@eslint-community/eslint-comments": eslintComments },
    rules: {
      "@eslint-community/eslint-comments/no-restricted-disable": ["error", "boundaries/*", "archie-view-law/*"],
    },
  },
  // L37 — see eslint-rules/boundaries/config.js. `src/client/**` is the client's survivor zone.
  ...boundariesConfig(),
  // L38 + V3b — only on VIEW_GLOBS. The type-aware rules need the TS program (projectService);
  // test/fixture files are not in the app tsconfig, so they are excluded from both blocks.
  {
    files: [...VIEW_GLOBS],
    ignores: [...VIEW_IGNORES],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  viewLawConfig({ files: [...VIEW_GLOBS] }),
];
