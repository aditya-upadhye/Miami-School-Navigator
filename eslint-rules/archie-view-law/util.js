// @ts-check
/**
 * Shared helpers for the view-law rules (plain JS + JSDoc on purpose: ESLint 10 under Node 22
 * cannot load `.ts` plugins without a loader, and this plugin must work in every customer repo
 * with nothing but `eslint .`).
 */
import { readFileSync } from "node:fs";
import { ESLintUtils } from "@typescript-eslint/utils";
import ts from "typescript";

export const createRule = ESLintUtils.RuleCreator(
  (name) => `eslint-rules/archie-view-law/README.md#${name}`,
);

/**
 * The allowlists live in ONE place: `archie.view-law.json` at the template root (pure JSON, no eslint
 * coupling; also read by apg's build:lib -> catalog.json). It is resolved relative to THIS file
 * (`<root>/eslint-rules/archie-view-law/util.js`), so it works in the template and in a generated app,
 * whose root is the app root. The exports below are derived from it and keep their historical names.
 */
export const VIEW_LAW_JSON_URL = new URL("../../archie.view-law.json", import.meta.url);

/**
 * @typedef {{ version: number; importPrefixes: string[]; importExact: string[];
 *   importBans: { router: string[]; data: string[]; infra: string[] }; hooks: string[]; segmentGuard: string }} ViewLaw
 */
/** @type {ViewLaw} */
export const VIEW_LAW = JSON.parse(readFileSync(VIEW_LAW_JSON_URL, "utf8"));

/** The allowed hooks (`useReactTable`: its vendor shim is the only table door). Everything else matching /^use[A-Z]/ is a violation. */
export const ALLOWED_HOOKS = Object.freeze([...VIEW_LAW.hooks]);

/**
 * Import planes a view may touch: the specifier itself or its `/…` subpaths only (`react` matches
 * `react` and `react/jsx-runtime` but NOT `react-router`); a trailing `/` means "this directory".
 */
export const ALLOWED_IMPORT_PREFIXES = Object.freeze([...VIEW_LAW.importPrefixes]);

/** Specifiers allowed ONLY verbatim (no subpaths, no longer names). */
export const ALLOWED_IMPORT_EXACT = Object.freeze([...VIEW_LAW.importExact]);

/**
 * Ban prefixes per ban rule. An entry ending in `*` is a raw string prefix (`react-router*` also
 * catches `react-router-dom`, `@archie/*` catches `@archie/js-sdk`); any other entry is exact-or-subpath.
 */
export const IMPORT_BANS = Object.freeze({
  router: Object.freeze([...VIEW_LAW.importBans.router]),
  data: Object.freeze([...VIEW_LAW.importBans.data]),
  infra: Object.freeze([...VIEW_LAW.importBans.infra]),
});

/** @param {string} specifier @param {readonly string[]} bans */
export function matchesBan(specifier, bans) {
  return bans.some((b) => (b.endsWith("*") ? specifier.startsWith(b.slice(0, -1)) : matchesPrefix(specifier, b)));
}

/** @param {string} specifier @param {string} prefix */
export function matchesPrefix(specifier, prefix) {
  if (prefix.endsWith("/")) return specifier.startsWith(prefix);
  return specifier === prefix || specifier.startsWith(`${prefix}/`);
}

/** @param {any} node */
export function isFunctionNode(node) {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

/** Dotted chain of a (non-computed) member expression: `Math.max`, `props.rows`. */
/** @param {any} node @returns {string | undefined} */
export function memberChain(node) {
  if (!node) return undefined;
  if (node.type === "ChainExpression") return memberChain(node.expression);
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    const base = memberChain(node.object);
    return base === undefined ? undefined : `${base}.${node.property.name}`;
  }
  return undefined;
}

/** Name a call goes by: `useFoo()` -> useFoo, `React.useFoo()` / `a.b.filter()` -> last segment. */
/** @param {any} call @returns {string | undefined} */
export function calleeName(call) {
  const callee = call.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return undefined;
}

/** Strip a ChainExpression wrapper (`a?.b()` is ChainExpression > CallExpression in ESTree). */
/** @param {any} node */
export function unwrapChain(node) {
  return node && node.type === "ChainExpression" ? node.expression : node;
}

/**
 * Names of the domain entities, from (in order of precedence):
 *  1. the rule option `entityNames` when non-empty;
 *  2. auto-detection: the exported type/interface/class/enum names declared in
 *     `src/domain/entities/**` — read from the TS program's source files, plus a syntactic scan of
 *     that folder on disk so an entity the view's program does not reach yet is still known.
 *
 * @param {import("@typescript-eslint/utils").TSESLint.RuleContext<string, any[]>} context
 * @param {{ entityNames?: readonly string[] }} options
 * @returns {ReadonlySet<string>}
 */
export function resolveEntityNames(context, options) {
  if (options.entityNames && options.entityNames.length > 0) {
    return new Set(options.entityNames);
  }
  const services = ESLintUtils.getParserServices(context, true);
  const program = services.program;
  // Cached per program only (a WeakMap: editors recreate programs on every edit, never leak them).
  const cached = program ? ENTITY_CACHE.get(program) : undefined;
  if (cached) return cached;
  const names = new Set();
  const roots = new Set();
  if (program) {
    const cfg = program.getCompilerOptions().configFilePath;
    if (typeof cfg === "string") roots.add(cfg.replace(/[\\/][^\\/]*$/, ""));
    else roots.add(program.getCurrentDirectory());
    for (const sf of program.getSourceFiles()) {
      if (/[\\/]src[\\/]domain[\\/]entities[\\/]/.test(sf.fileName)) collectDeclaredNames(sf, names);
    }
  }
  if (!program) roots.add(context.cwd);
  for (const root of roots) {
    const dir = `${root.replace(/\\/g, "/")}/src/domain/entities`;
    if (!ts.sys.directoryExists(dir)) continue;
    for (const file of ts.sys.readDirectory(dir, [".ts", ".tsx"])) {
      if (file.endsWith(".d.ts")) continue;
      const text = ts.sys.readFile(file);
      if (text !== undefined) {
        collectDeclaredNames(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false), names);
      }
    }
    break;
  }
  if (program) ENTITY_CACHE.set(program, names);
  return names;
}
/** @type {WeakMap<object, ReadonlySet<string>>} */
const ENTITY_CACHE = new WeakMap();

/** Top-level exported interface / type alias / class / enum names of a source file. */
/** @param {import("typescript").SourceFile} sf @param {Set<string>} out */
function collectDeclaredNames(sf, out) {
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st)
      ? (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (
      exported &&
      (ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      st.name
    ) {
      out.add(st.name.text);
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) out.add(el.name.text);
    }
  }
}

/**
 * Type-aware "is this expression an array of a domain entity?" Decided on TYPES via the checker,
 * never on names: `readonly Booking[]`, `Booking[]`, `ReadonlyArray<Booking>` and the nullable
 * forms all resolve; element name = `aliasSymbol ?? symbol` name.
 *
 * @param {import("@typescript-eslint/utils").TSESLint.RuleContext<string, any[]>} context
 * @param {{ entityNames?: readonly string[] }} options
 * @returns {(node: any) => string | undefined}
 */
export function entityArrayDetector(context, options) {
  const services = ESLintUtils.getParserServices(context, true);
  // No TS program (a file outside the project, e.g. a colocated test): the typed rules are no-ops.
  if (!services.program) return () => undefined;
  const checker = services.program.getTypeChecker();
  const names = resolveEntityNames(context, options);
  return (node) => {
    if (names.size === 0) return undefined;
    const tsNode = services.esTreeNodeToTSNodeMap.get(node);
    if (!tsNode) return undefined;
    const type = checker.getNonNullableType(checker.getTypeAtLocation(tsNode));
    if (!checker.isArrayType(type)) return undefined;
    const el = checker.getTypeArguments(/** @type {import("typescript").TypeReference} */ (type))[0];
    if (!el) return undefined;
    const name = baseEntityName(el);
    return name !== undefined && names.has(name) ? name : undefined;
  };
}

/** Mapped wrappers that still denote the entity: `Readonly<Booking>`, `Pick<Booking, "id">`, ... */
const WRAPPERS = new Set(["Readonly", "Partial", "Required", "Pick", "Omit"]);

/** Element type -> entity name, looking through the wrappers above (via their type arguments). */
/** @param {import("typescript").Type} type @returns {string | undefined} */
function baseEntityName(type) {
  const alias = type.aliasSymbol;
  const args = type.aliasTypeArguments;
  if (alias && WRAPPERS.has(alias.name) && args && args[0]) return baseEntityName(args[0]);
  return alias?.name ?? type.getSymbol()?.name;
}

/** `x.length` (non computed). Returns the object node. */
/** @param {any} n */
export function lengthObjectOf(n) {
  return n.type === "MemberExpression" &&
    !n.computed &&
    n.property.type === "Identifier" &&
    n.property.name === "length"
    ? n.object
    : undefined;
}

/** Shared option schema of the entity-aware rules. */
/** @type {import("@typescript-eslint/utils").JSONSchema.JSONSchema4[]} */
export const ENTITY_OPTIONS_SCHEMA = [
  {
    type: "object",
    properties: { entityNames: { type: "array", items: { type: "string" } } },
    additionalProperties: false,
  },
];
