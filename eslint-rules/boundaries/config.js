// @ts-check
/**
 * L37 — the hexagonal dependency map, enforced by eslint-plugin-boundaries (v7 `dependencies` rule).
 *
 *   presentation -> application -> domain          infrastructure -> domain
 *   ONLY infrastructure/archie imports the SDK (@archie/js-sdk, @archie/react-sdk).
 *
 * Elements (first match wins; specific before general). EVERY file under src/ lands in one of them:
 *
 *   client                 src/client/**                  survivor zone: the client's own code. NO
 *                          restrictions on what IT imports (see src/client/README.md)
 *   infrastructure-archie  src/infrastructure/archie/**   the ONLY door to the SDK
 *   infrastructure         src/infrastructure/**          adapters (memory, ...): may import domain
 *   domain                 src/domain/**                  PURE: imports nothing outside domain
 *   application            src/application/**             view-models, use cases: domain only
 *   presentation           src/presentation/**, src/screens/**   views, containers, layout(s),
 *                          (Kit-D)                        chrome, components/domain: application,
 *                                                          domain, ui-plane, i18n; never infra/app
 *   app                    src/app/**                     composition root: imports everything; the
 *                          (+ file category app-file:      SDK only by symbol. Layout.tsx and
 *                          Layout.tsx, routes.config.tsx)  routes.config.tsx get the same rights, but
 *                                                          only app, main and App.tsx may import them
 *   i18n                   src/i18n/**                    template plane: no layers, no SDK
 *   ui-plane               src/components|hooks|lib|config|vendor|styles/**   same
 *   legacy-gen             src/lib/gen/**                 Kit-D legacy helpers: same as ui-plane (L70: no SDK)
 *   other                  any other src/** file/folder   catch-all (src/App.tsx, src/features/**,
 *                          ...): no SDK, no infrastructure; cannot be imported by
 *                          presentation/application/domain
 *
 * The SDK (@archie/**) is denied from EVERY element except infrastructure-archie, app (by symbol),
 * main (file category `main` = src/main.tsx, by symbol) and client. Policies are evaluated in order, LAST MATCH WINS, and the default is
 * "allow": that is why each plane's own deny list is explicit and the catch-all `other` exists.
 *
 * Not expressible / declared: "presentation -> domain is TYPE-ONLY" is not enforced (any import is
 * allowed; the view-law plugin already confines VIEWS to the VM's types). An import that does not
 * resolve to a file (a typo) is classified external and not judged: `tsc` owns that error.
 */
import { fileURLToPath } from "node:url";
import boundaries from "eslint-plugin-boundaries";

const RESOLVER = fileURLToPath(new URL("./ts-alias-resolver.cjs", import.meta.url));

/** Template files classified as `app` (must match BEFORE ui-plane / other). */
export const APP_FILES = Object.freeze(["src/components/Layout.tsx", "src/routes.config.tsx"]);

/** Element types, in match order (first match wins). */
export const ELEMENTS = Object.freeze([
  { type: "client", pattern: "src/client/**", partialMatch: false },
  { type: "infrastructure-archie", pattern: "src/infrastructure/archie/**", partialMatch: false },
  { type: "infrastructure", pattern: "src/infrastructure/**", partialMatch: false },
  { type: "domain", pattern: "src/domain/**", partialMatch: false },
  { type: "application", pattern: "src/application/**", partialMatch: false },
  // Kit-D apps (gv2's lane) emit their dumb views to src/screens/<slug>.tsx: presentation by
  // location. They are Kit views, NOT covered by the view law (which targets src/presentation/views).
  { type: "presentation", pattern: ["src/presentation/**", "src/screens/**"], partialMatch: false },
  // The two enumerated L42 exceptions gv2 overwrites to mount the composition root: the file the
  // immutable App.tsx imports (Layout.tsx) and the route manifest. They get app's rights.
  { type: "app", pattern: "src/app/**", partialMatch: false },
  { type: "i18n", pattern: "src/i18n/**", partialMatch: false },
  // Legacy generated helpers of Kit-D apps (shell-user, role-nav, preview-auth). L70 removed their SDK
  // imports (the session is asked of the port), so they are a template plane like ui-plane.
  { type: "legacy-gen", pattern: "src/lib/gen/**", partialMatch: false },
  {
    type: "ui-plane",
    pattern: ["src/components/**", "src/hooks/**", "src/lib/**", "src/config/**", "src/vendor/**", "src/styles/**"],
    partialMatch: false,
  },
  // Catch-all: src/main.tsx, src/App.tsx and any unknown folder (src/features/**).
  // NOTE: element patterns match FOLDERS; a single file (main.tsx) is told apart by FILE category.
  { type: "other", pattern: "src/**", partialMatch: false },
]);

/** File categories (they cut across elements). */
export const FILES = Object.freeze([
  { category: "main", pattern: "src/main.tsx" },
  // The template's immutable entry: the only non-app file that may import the app-files.
  { category: "entry", pattern: "src/App.tsx" },
  // Element patterns match folders, so these two single files are told apart by FILE category and
  // granted app's rights by the last policies (they sit in ui-plane / other by folder).
  { category: "app-file", pattern: [...APP_FILES] },
]);


/** Externals a pure domain must never touch (spec: react, the SDK, graphql, HTTP clients). */
const DOMAIN_BANNED_EXTERNALS = [
  "react",
  "react/**",
  "react-*",
  "react-*/**",
  "@archie/**",
  "graphql",
  "graphql-*",
  "@apollo/**",
  "@tanstack/**",
  "axios",
  "ky",
  "got",
  "swr",
  "urql",
  "@urql/**",
  "node-fetch",
  "cross-fetch",
  "ofetch",
];

/** Symbols the composition root may take from `@archie/react-sdk` (L70: enumerated BY symbol). */
export const APP_SDK_SYMBOLS = Object.freeze(["AuthGuard", "useArchieClient"]);
/** What the template's immutable `src/main.tsx` mounts (ArchieProvider tree + devtools provider). */
export const MAIN_SDK_SYMBOLS = Object.freeze(["createClient", "ArchieProvider", "ArchieDevToolProvider"]);

/** @param {string | string[]} source */
const external = (source) => ({ module: { origin: "external", source } });
/** @param {string[]} types */
const el = (...types) => ({ element: { type: types.length === 1 ? types[0] : types } });

/** Symbol-only SDK access for one `from` selector: deny all, re-allow named symbols, deny any other. */
/** @param {object} from @param {string} source @param {readonly string[]} symbols */
const sdkBySymbol = (from, source, symbols) => [
  // (1) deny every dependency on the source: this alone catches `import * as`, default imports,
  // `export *` and dynamic `import()`, which carry no named specifiers
  { from, disallow: { to: external(source) } },
  // (2) re-allow a dependency that names an allowed symbol
  { from, allow: { to: external(source), dependency: { specifiers: `+(${symbols.join("|")})` } } },
  // (3) deny again when it ALSO names any other symbol
  { from, disallow: { to: external(source), dependency: { specifiers: `!(${symbols.join("|")})` } } },
];

/** Planes that may never reach the layers above them. */
const NOT_LAYERS = ["infrastructure", "infrastructure-archie", "application", "presentation", "app"];

/** The `boundaries/dependencies` policies (exported so tests and gv2 can inspect/extend them). */
export const DEPENDENCY_POLICIES = Object.freeze([
  // --- the SDK is denied from EVERY element except infrastructure-archie, app, main and client ----
  {
    from: el("domain", "application", "presentation", "infrastructure", "i18n", "ui-plane", "legacy-gen", "other"),
    disallow: { to: external("@archie/**") },
  },
  // --- domain is PURE: imports nothing outside domain, nothing from npm that does IO/UI/transport --
  { from: el("domain"), disallow: { to: { element: { type: "!domain" } } } },
  { from: el("domain"), disallow: { to: external(DOMAIN_BANNED_EXTERNALS) } },
  // --- application -> domain (and itself) only: no laundering through lib/other/template files ---
  { from: el("application"), disallow: { to: { element: { type: "!(application|domain|client)" } } } },
  // --- presentation -> application, domain, ui-plane, i18n; never infrastructure/app/other -------
  {
    from: el("presentation"),
    disallow: { to: { element: { type: "!(presentation|application|domain|ui-plane|legacy-gen|i18n|client)" } } },
  },
  // --- infrastructure -> domain (and itself) ------------------------------------------------------
  {
    from: el("infrastructure", "infrastructure-archie"),
    disallow: { to: { element: { type: "!(infrastructure|infrastructure-archie|domain|client)" } } },
  },
  // --- template planes never reach a layer ---------------------------------------------------------
  { from: el("ui-plane", "i18n", "legacy-gen"), disallow: { to: el(...NOT_LAYERS) } },
  // --- unknown folders and template root files never reach infrastructure --------------------------
  { from: el("other"), disallow: { to: el("infrastructure", "infrastructure-archie") } },
  // --- composition root: SDK by SYMBOL (AuthGuard, useArchieClient) + `import type` of js-sdk -----
  ...sdkBySymbol(el("app"), "@archie/react-sdk", APP_SDK_SYMBOLS),
  { from: el("app"), disallow: { to: external("@archie/js-sdk"), dependency: { kind: "value" } } },
  { from: el("app"), disallow: { to: external("@archie/devtools/**") } },
  // --- Layout.tsx / routes.config.tsx (L42 exceptions): app's rights = may import any layer ----------
  { from: { file: { categories: "app-file" } }, allow: { to: el(...NOT_LAYERS) } },
  ...sdkBySymbol({ file: { categories: "app-file" } }, "@archie/react-sdk", APP_SDK_SYMBOLS),
  { from: { file: { categories: "app-file" } }, allow: { to: external("@archie/js-sdk") } },
  { from: { file: { categories: "app-file" } }, disallow: { to: external("@archie/js-sdk"), dependency: { kind: "value" } } },
  { from: { file: { categories: "app-file" } }, disallow: { to: external("@archie/devtools/**") } },
  // --- app-files cannot be laundered: only app, main, App.tsx (and app-files) may import them -----
  {
    from: el("domain", "application", "presentation", "infrastructure", "infrastructure-archie", "i18n", "ui-plane", "legacy-gen", "other"),
    disallow: { to: { file: { categories: "app-file" } } },
  },
  { from: el("app"), allow: { to: { file: { categories: "app-file" } } } },
  { from: { file: { categories: ["main", "entry", "app-file"] } }, allow: { to: { file: { categories: "app-file" } } } },
  // --- main.tsx: exactly the symbols it mounts ---------------------------------------------------
  ...sdkBySymbol({ file: { categories: "main" } }, "@archie/**", MAIN_SDK_SYMBOLS),
]);

/**
 * A re-export alias would defeat the by-symbol rule above (`export { useQuery as AuthGuard } from`
 * records the specifier as `AuthGuard`). In `src/app`, a re-export from `@archie/*` must be exactly
 * `export { Name } from "..."` with local === exported === an allowed symbol.
 */
const APP_REEXPORT_SELECTOR = `ExportNamedDeclaration[source.value=/^@archie\\//] > ExportSpecifier${APP_SDK_SYMBOLS.map(
  (n) => `:not([local.name="${n}"][exported.name="${n}"])`,
).join("")}`;

/**
 * What L37 lints: TS/TSX AND JS/JSX (transplanted `*.view.jsx` live under src/presentation/views and
 * are judged by the hexagon, though NOT by the view law, whose globs stay `*.{ts,tsx}`).
 */
export const BOUNDARIES_GLOBS = Object.freeze(["src/**/*.{ts,tsx,js,jsx}"]);

/**
 * Flat-config blocks: plugin + settings + the dependencies rule, plus the `src/app` re-export guard.
 * @param {{ files?: string[]; rootPath?: string }} [options] `rootPath` defaults to the cwd
 */
export function boundariesConfig(options = {}) {
  const files = options.files ?? [...BOUNDARIES_GLOBS];
  return [
    {
      files,
      plugins: { boundaries },
      settings: {
        "boundaries/elements": ELEMENTS,
        "boundaries/files": FILES,
        "boundaries/include": ["src/**/*"],
        ...(options.rootPath ? { "boundaries/root-path": options.rootPath } : {}),
        "import/resolver": { [RESOLVER]: options.rootPath ? { srcRoot: `${options.rootPath}/src` } : {} },
      },
      rules: {
        "boundaries/dependencies": [
          "error",
          { default: "allow", checkAllOrigins: true, checkInternals: true, policies: DEPENDENCY_POLICIES },
        ],
      },
    },
    {
      files: ["src/app/**/*.{ts,tsx,js,jsx}", ...APP_FILES],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: APP_REEXPORT_SELECTOR,
            message: `src/app may re-export only ${APP_SDK_SYMBOLS.join(" / ")} from the SDK, under the same name (no alias).`,
          },
        ],
      },
    },
  ];
}
