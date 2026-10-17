# eslint-plugin-archie-view-law (local)

A local ESLint plugin: it lives in the template, travels with every generated repo and is **not
published**. It enforces the "view law" on the dumb view layer: a view renders what its ViewModel
hands it and calls the callbacks it was given; everything else belongs to a deterministic layer.

Implementation is plain ESM JavaScript with JSDoc types, deliberately: the lint must work with
nothing but `eslint .` on any Node the customer runs (ESLint cannot load `.ts` plugins without a
loader on Node 22). The rules use `typescript-eslint`'s `RuleCreator` and parser services.

## Which files are views

`view-globs.js` exports `VIEW_GLOBS` (`src/presentation/views/**/*.{ts,tsx}`), the single place the
globs live. `eslint.config.js` reads it; the conversion service (gv2) extends it by importing it and
spreading it into `files`. Kit-D apps (`src/screens/<slug>.tsx`) stay pinned to an older template
commit and do not get this lint.

Test and fixture files next to views (`*.test.{ts,tsx}`, `*.fixture.tsx`, `VIEW_IGNORES`) are not views:
they are outside the app tsconfig, so they are ignored by both the parser block and the rules (and the
typed helpers are no-ops when a file has no TS program, so a stray file can never crash the lint).

**Kit-D `src/screens/<slug>.tsx` are NOT covered by the view law** (they are Kit views; they are
classified `presentation` by the boundaries map only). The view law applies to `VIEW_GLOBS` alone.

The type-aware rules need the TS program: the views block in `eslint.config.js` sets
`parserOptions.projectService`.

## The allowlist single source: `archie.view-law.json`

`archie.view-law.json` (template root, pure JSON) is the single source of the view-law allowlists (also
read by apg's build:lib -> catalog.json). Keys: `version` (number), `importPrefixes` (exact-or-subpath;
an entry ending in `/` is a directory prefix), `importExact` (verbatim only), `importBans`
(`router` / `data` / `infra`; an entry ending in `*` is a raw string prefix, otherwise exact-or-subpath),
`hooks`, `segmentGuard` (prose: a `.`/`..` path segment is refused before the allowlist). `util.js` reads
it relative to its own location (`../../archie.view-law.json`) and derives `ALLOWED_IMPORT_PREFIXES`,
`ALLOWED_IMPORT_EXACT`, `ALLOWED_HOOKS` and `IMPORT_BANS`; edit the JSON, never a copy of the lists. It
must ship with the template and any copy of `eslint-rules/` (the seeded-lint test copies it too).

## Rules (all `archie-view-law/<name>`)

| Rule | Severity | What it flags |
|---|---|---|
| `no-use-effect` | error | `useEffect`, `useLayoutEffect` (also `React.useEffect`) |
| `hook-not-allowed` | error | any other `use[A-Z]*` call outside the allowlist: `useState, useMemo, useCallback, useId, useRef, useTranslation, useForm, useFieldArray, useAppNavigate, useReactTable` |
| `router-import` | error | `react-router*`, `@/lib/router*` |
| `data-import` | error | `@/data*` |
| `infra-import` | error | `@/infrastructure*`, `@archie/*` |
| `disallowed-import` | error | any import outside the allowlist (`react`, `react/*`, `@/components/ui/`, `@/lib/proto/`, `@/lib/utils`, `@/presentation/components/domain/`, `@/application/view-models/`, `@/i18n`, `react-i18next`, `react-hook-form`, `lucide-react`, `motion/react`, plus the sanctioned stack `recharts` and `zod`; each entry matches the exact specifier or its `/…` subpaths only, so `zodiac` / `recharts-extra` stay out; and these verbatim-only specifiers, no subpaths: `@hookform/resolvers/zod`, `@/vendor/tanstack-react-table`, `@/vendor/motion`, `@/presentation/navigation` (gv2's route builders, replacing `react-router` imports), and the transplant helpers `@/lib/format`, `@/lib/map`, `@/lib/schedule`, `@/lib/board`, `@/lib/queue`, `@/lib/timeline`, `@/lib/stepper`, `@/lib/scene`, `@/lib/image`, `@/lib/client-only`, `@/lib/selectors` (each exact; `@/lib/router` stays banned, `@/lib/` is never allowed wholesale) — never `@/vendor/`, `@/presentation/` or `@hookform/resolvers` wholesale); relative imports are outside it too |
| `vm-value-import` | error | a value import of `@/application/view-models/` (must be `import type`) |
| `no-entity-derivation` | error, type-aware | `filter reduce sort find some every flatMap toSorted toReversed findLast findIndex findLastIndex includes forEach` on an array of a domain entity, and `.map(..).reduce/reduceRight`, `Math.max/min(...x.map())` |
| `for-loop-over-entity` | error, type-aware | `for…of` over an entity array; `for` whose test reads `<entity array>.length` |
| `entity-count-empty-check` | **warn**, type-aware | `<entity array>.length` used only as an emptiness test |
| `entity-count` | **warn**, type-aware | any other `<entity array>.length` use (page-1 math) |
| `module-level-read` | error | `Booking[0]` outside any function (fixture leaking in) |
| `date-in-render` | error | `new Date()`, `Date.now()`, `.toLocale*()` in render (handlers `handle*`/`on*`, `on*` JSX props and `useCallback` bodies are exempt) |
| `fixture-id-literal` | error, option-driven | a literal equal to / embedding a fixture row id |
| `no-entities-found` | **warn**, once per file | the view imports a ViewModel but no entity names were found (`src/domain/entities/**` moved/missing and no `entityNames` option): the entity rules are inactive for that file |
| `no-as-cast` | error | `x as T` (except `as const`) and `<T>x` |
| `no-any` | error | explicit `any` |
| `no-ts-comment` | error | `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` |

`.length` of an entity array is only a **warning**: `props.rows.length === 0` is the ordinary
empty-state check of the page in hand, and blocking it would break most list screens. `x.filter(..).length`
is reported once, as the derivation.

### Options

- `entityNames` (`no-entity-derivation`, `for-loop-over-entity`, `entity-count*`, `module-level-read`):
  the domain entity names. Default (omitted/empty): auto-detected as the exported interface / type
  alias / class / enum names declared in `src/domain/entities/**`. The decision is on **types**: the
  receiver must be an array (`T[]`, `readonly T[]`, `ReadonlyArray<T>`, nullable) whose element's
  `aliasSymbol ?? symbol` name is an entity.
- `fixtureIds` (`fixture-id-literal`): ids of the prototype's fixture rows. The conversion's fixture
  prepass produces them; the template has none, so the default is the empty list and **the rule is a
  no-op until ids are supplied**. gv2 supplies them WITHOUT editing any eslint config: drop
  `archie-view-law.fixtures.json` at the repo root (`["b1","b2"]` or `{"fixtureIds":["b1","b2"]}`);
  `viewLawConfig()` loads it when present (an explicit `fixtureIds` option wins). Matching: equality for any id;
  token-boundary containment for ids of 5+ chars; a numeric-only id never matches in a value-like
  attribute (`value`, `min`, `colSpan`, ...).

## Wiring

```js
import { VIEW_GLOBS, viewLawConfig } from "./eslint-rules/archie-view-law/index.js";
// ...
viewLawConfig({ files: [...VIEW_GLOBS], entityNames: undefined, fixtureIds: undefined })
```

## Tests

`bun test eslint-rules` runs a valid + invalid case for every rule (`tests/rules.test.ts`, with
`@typescript-eslint/rule-tester` over the tiny real project in `__fixtures__/project`) and the
boundaries / seeded-build tests (`../boundaries/boundaries.test.ts`).

## Conventions (the contract gv2 emits against)

The configs read these paths and nothing else; nothing needs editing per app.

| Convention | Path | Used by |
|---|---|---|
| Route builders | `src/presentation/navigation.ts` (single file; a view imports it as the exact specifier `@/presentation/navigation`) | `disallowed-import` allowlist (presentation -> presentation, fine for boundaries) |
| Views | `src/presentation/views/**/*.view.tsx` (glob is `VIEW_GLOBS`: any `.ts/.tsx` under `views/`) | the whole view law |
| Transplanted views | `src/presentation/views/**/*.view.jsx` (+ emitted `*.view.d.ts`) | **under L37 (boundaries), OUTSIDE the view law by decision** (`.jsx` is not in `VIEW_GLOBS`); the rest is policed by gv2's conversion gate C + AST assertions. See "Transplanted views" |
| ViewModels | `src/application/view-models/**` (`import type` only from a view) | `vm-value-import`, `disallowed-import`, `no-entities-found` |
| Domain entities | `src/domain/entities/**` (exported types/interfaces/classes/enums are the entity names) | all `entity-*`, `no-entity-derivation`, `for-loop-over-entity`, `module-level-read` |
| SDK door | `src/infrastructure/archie/**` | boundaries: the only place `@archie/*` may be imported |
| In-memory adapters | `src/infrastructure/memory/**` | boundaries: infrastructure (domain only, no SDK) |
| Composition root | `src/app/**` | boundaries: imports everything; SDK only `AuthGuard`, `useArchieClient` (+ `import type` of the js-sdk); re-exports under the same name |
| Composition root (L42 exceptions) | `src/components/Layout.tsx`, `src/routes.config.tsx` (gv2 overwrites them to mount the composition root; classified `app`, same rights) | boundaries |
| Mount point | `src/main.tsx` | boundaries: exactly `createClient`, `ArchieProvider`, `ArchieDevToolProvider` |
| Survivor zone | `src/client/**` | no restrictions on what it imports |
| Kit-D views / chrome | `src/screens/**` (presentation), `src/components/kit/**` + `src/styles/kitd/**` (ui-plane), `src/lib/gen/**` (legacy-gen) | boundaries |
| ui-plane | `src/components/**`, `src/hooks/**`, `src/lib/**`, `src/config/**`, `src/vendor/**`, `src/styles/**` | boundaries: no layers, no SDK |
| i18n | `src/i18n/**` | boundaries: same as ui-plane |
| Optional fixture ids | `archie-view-law.fixtures.json` (repo root) | `fixture-id-literal` |

Anything else under `src/` (e.g. `src/features/**`) is "other": no SDK, no infrastructure, and
presentation/application/domain cannot import it. See `eslint-rules/boundaries/README.md`.

`src/lib/gen/**` (shell-user, role-nav, preview-auth): L70 removed their SDK imports (the session is
asked of the port), so they are a template plane: they may import ui-plane/Kit/domain-free helpers and
**not** `@archie/*` or any layer.

## Transplanted views (`*.view.jsx`)

`generate-frontend` transplants the prototype's JSX verbatim into `src/presentation/views/**/*.view.jsx`
and emits a `.d.ts` beside each (types at the boundary). **Decision: `.jsx` stays OUTSIDE the view law,
and `VIEW_GLOBS` is NOT widened.** Reason: the transplanted source is the prototype's own markup, and
without a whole-read marker the entity rules cannot tell it apart from a hand-written view, so widening
the globs would make every transplanted view trip `no-entity-derivation`. Those views are policed by
gv2's conversion (gate C and AST assertions), not by this plugin.

**`.jsx` is under L37 (boundaries), outside the view law** (gv2's gate C + AST assertions police
transplanted views). `boundariesConfig()` lints `src/**/*.{ts,tsx,js,jsx}` (`BOUNDARIES_GLOBS`), and the
laws config parses `src/**/*.{js,jsx}` with the typescript-eslint parser WITHOUT `projectService` (boundaries
is not type-aware). So a `.view.jsx` that imports `@archie/*` or `@/infrastructure/**` fails `lint:laws`,
the by-symbol SDK rules for `src/app`/`main`/app-files apply to `.jsx` too, and an inline
`eslint-disable boundaries/*` in a `.jsx` is an error. Hooks (`useEffect`), entity derivation and the rest
of the view law are NOT checked there.

The emitted `*.view.d.ts` IS a `.ts` under `views/`, so the view law applies to it.

## Two lint commands

- `bun run lint` (`eslint .`): the developer command, generic rules + the laws.
- `bun run lint:laws` (`eslint -c eslint.laws.config.js .`): the laws only. **`bun run build` runs this
  one**, so generic react-hooks / typescript-eslint findings never block a build.
