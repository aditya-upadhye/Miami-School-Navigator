@AGENTS.md

Claude Code-specific notes for this repo:

- Run `bun run build:check` before finishing any non-trivial change — it's the fastest way to
  prove the tree still type-checks and builds; `bun run lint` too if you touched more than a
  couple of files.
- Never `git push --force` (or `--force-with-lease`) to this repo. Conversions commit on top of
  this repo's existing history without forcing; a force-push here can silently discard or conflict
  with commits the platform is about to build on.
- Prefer `bun run <script>` over invoking `vite`/`tsc` directly — the scripts in `package.json`
  can pick up flags or steps you'd otherwise miss.
- Don't add a test runner, linter, or formatter that isn't already a dependency without asking —
  this template is deliberately dependency-light.
