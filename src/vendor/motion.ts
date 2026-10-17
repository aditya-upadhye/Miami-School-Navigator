// Motion for React. The package was renamed from framer-motion to motion (import path `motion/react`);
// This module re-exports `motion/react`, so code can import it as `@/vendor/motion`; no bundler alias maps
// `framer-motion` or `motion/react` to it, so those specifiers resolve to the installed `motion` package itself.
export * from "motion/react"
