/**
 * Which files are "views" (the view law applies to them, and ONLY them).
 *
 * The shadcn conversion's layout is `src/presentation/views/<slug>.view.tsx` (plan v3 file-layout
 * contract). Kit-D apps (`src/screens/<slug>.tsx`) stay pinned to an older template commit and
 * never receive this lint, so they are deliberately NOT listed.
 *
 * This is the SINGLE place the globs live. `index.js` and `eslint.config.js` both read it, and the
 * conversion service (gv2) can extend it by importing `VIEW_GLOBS` and spreading it:
 *
 *   import { VIEW_GLOBS } from "./eslint-rules/archie-view-law/view-globs.js";
 *   files: [...VIEW_GLOBS, "src/some/other/views/**\/*.tsx"]
 */
export const VIEW_GLOBS = Object.freeze(["src/presentation/views/**/*.{ts,tsx}"]);

/** Files under the view globs that are NOT views: they are outside the app tsconfig, so no TS program. */
export const VIEW_IGNORES = Object.freeze(["**/*.test.{ts,tsx}", "**/*.fixture.tsx"]);
