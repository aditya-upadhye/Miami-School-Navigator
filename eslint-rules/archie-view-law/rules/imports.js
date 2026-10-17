// @ts-check
import { ALLOWED_IMPORT_EXACT, ALLOWED_IMPORT_PREFIXES, IMPORT_BANS, createRule, matchesBan, matchesPrefix } from "../util.js";

const PATH_SEGMENT_TRAVERSAL = /(^|\/)\.\.?(\/|$)/;
const ALLOWED_LIST = [...ALLOWED_IMPORT_PREFIXES, ...ALLOWED_IMPORT_EXACT].join(", ");

const VIEW_MODELS_PREFIX = "@/application/view-models/";

/** The ban (if any) a specifier falls under; each ban is its own rule so severities can differ. */
/** @param {string} spec @returns {"router-import" | "data-import" | "infra-import" | undefined} */
function banKind(spec) {
  if (matchesBan(spec, IMPORT_BANS.router)) return "router-import";
  if (matchesBan(spec, IMPORT_BANS.data)) return "data-import";
  if (matchesBan(spec, IMPORT_BANS.infra)) return "infra-import";
  return undefined;
}

/**
 * Every module reference of the file: `import`, `export … from`, `export * from`, dynamic
 * `import()` and `require()`. `isValue` is false for `import type` / all-`type` specifiers.
 * @param {import("@typescript-eslint/utils").TSESLint.RuleContext<string, any[]>} context
 * @param {(ref: { spec: string; node: any; isValue: boolean }) => void} onRef
 */
function listen(context, onRef) {
  /** @param {any} decl @param {"importKind" | "exportKind"} key */
  const isValueDecl = (decl, key) => {
    if (decl[key] === "type") return false;
    const specs = decl.specifiers ?? [];
    return !(specs.length > 0 && specs.every((/** @type {any} */ s) => s[key] === "type"));
  };
  return {
    /** @param {any} node */
    ImportDeclaration(node) {
      onRef({ spec: String(node.source.value), node, isValue: isValueDecl(node, "importKind") });
    },
    /** @param {any} node */
    ExportAllDeclaration(node) {
      onRef({ spec: String(node.source.value), node, isValue: node.exportKind !== "type" });
    },
    /** @param {any} node */
    ExportNamedDeclaration(node) {
      if (node.source) onRef({ spec: String(node.source.value), node, isValue: isValueDecl(node, "exportKind") });
    },
    /** @param {any} node */
    ImportExpression(node) {
      if (node.source.type === "Literal" && typeof node.source.value === "string") {
        onRef({ spec: node.source.value, node, isValue: true });
      }
    },
    /** @param {any} node */
    CallExpression(node) {
      const arg = node.arguments[0];
      if (
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        arg &&
        arg.type === "Literal" &&
        typeof arg.value === "string"
      ) {
        onRef({ spec: arg.value, node, isValue: true });
      }
    },
  };
}

/** @param {"router-import" | "data-import" | "infra-import"} kind */
function banRule(kind) {
  return createRule({
    name: kind,
    meta: {
      type: "problem",
      docs: {
        description:
          {
            "router-import": "Views never import the router (`react-router*`, `@/lib/router*`); navigation is a ViewModel callback / useAppNavigate.",
            "data-import": "Views never import fixture/data modules (`@/data*`).",
            "infra-import": "Views never import infrastructure or the SDK (`@/infrastructure*`, `@archie/*`).",
          }[kind],
      },
      schema: [],
      messages: { banned: '"{{spec}}" is banned in a view ({{kind}})' },
    },
    defaultOptions: [],
    create(context) {
      return listen(context, ({ spec, node }) => {
        if (banKind(spec) === kind) context.report({ node, messageId: "banned", data: { spec, kind } });
      });
    },
  });
}

export const routerImport = banRule("router-import");
export const dataImport = banRule("data-import");
export const infraImport = banRule("infra-import");

export const disallowedImport = createRule({
  name: "disallowed-import",
  meta: {
    type: "problem",
    docs: { description: "Views may only import the allowlisted planes (react, ui kit, proto helpers, i18n, the VM type)." },
    schema: [],
    messages: { disallowed: '"{{spec}}" is outside the allowed import planes: {{allowed}}' },
  },
  defaultOptions: [],
  create(context) {
    return listen(context, ({ spec, node }) => {
      // A `.`/`..` segment defeats every prefix check (`recharts/../../src/data/x` resolves into src/
      // because recharts has no `exports` map), so it is refused before any allowlist or ban check.
      // Ordinary relative imports (`./x`, `../x`) fall here too: views never use them.
      if (PATH_SEGMENT_TRAVERSAL.test(spec)) {
        context.report({ node, messageId: "disallowed", data: { spec, allowed: ALLOWED_LIST } });
        return;
      }
      if (banKind(spec) !== undefined) return; // owned by its own ban rule
      if (ALLOWED_IMPORT_EXACT.includes(spec)) return;
      if (ALLOWED_IMPORT_PREFIXES.some((p) => matchesPrefix(spec, p))) return;
      context.report({
        node,
        messageId: "disallowed",
        data: { spec, allowed: ALLOWED_LIST },
      });
    });
  },
});

export const vmValueImport = createRule({
  name: "vm-value-import",
  meta: {
    type: "problem",
    docs: { description: "A value import of `@/application/view-models/` is banned: it must be `import type`." },
    schema: [],
    messages: {
      value: '"{{spec}}" must be a type-only import (`import type { … }`): a view never executes ViewModel code',
    },
  },
  defaultOptions: [],
  create(context) {
    return listen(context, ({ spec, node, isValue }) => {
      if (spec.startsWith(VIEW_MODELS_PREFIX) && isValue) context.report({ node, messageId: "value", data: { spec } });
    });
  },
});
