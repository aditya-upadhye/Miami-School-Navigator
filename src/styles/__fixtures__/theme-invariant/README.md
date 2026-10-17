# theme-invariant fixtures

- `ds-a.json`, `ds-b.json`, `ds-c.json`: three design systems (a has `semantic.control`, wider radii; b has `--radius: 0`, no control sizes, no sinks; c is b plus `borderRadius.semantic` all `0px` and `shadows.card: "none"`, a flat design system).
- `ds-*.tailwind.css` / `ds-*.theme.css`: apg's T2 `compileTheme()` output for them (apg `scripts/theme-invariant-fixtures.ts`, ARCH-2390; no LLM),
  split into the half Tailwind compiles and the `theme.css` half (`splitThemeCss`). The tailwind half is the RESIDUE: the embedded
  theme contract is stripped (this repo's own tests load `theme-contract.css` themselves), so it keeps only what the contract lacks
  (extra colour keys, `font-display`, `type-*` of non-contract roles). The theme half carries the semantic sinks apg now writes from
  `borderRadius.semantic` / `shadows.card` (ds-a: `--theme-radius-control|card|modal|badge`, `--theme-shadow-card`; ds-b has none; ds-c writes `0px` radius sinks and `--theme-shadow-card: 0 0 #0000`, apg's none).
  Regenerate (output goes to a directory of your own, the script refuses to write into the template; then copy the `ds-*.css` files here):
  `cd <apg> && APG_TEMPLATE_DIR=<this checkout> bun scripts/theme-invariant-fixtures.ts --out <dir>`.
- `globals.aed3a951.css`: the template's globals.css at aed3a951, frozen (the "old" column).
- `rows.json`: the (old classes, new classes, property) table the compat test resolves. `expected.json`: the rows whose new value differs
  from the old one, with BOTH values frozen and a reason; every other (row, theme) pair must be identical.
- `candidates.json`: every class token in `src/components/ui/**` (used by the PR-A byte-equality test, kept as a corpus).
