// @ts-check
/** Rules that need no type information: module-level reads, fixture ids, `Date` in render. */
import {
  ENTITY_OPTIONS_SCHEMA,
  calleeName,
  createRule,
  isFunctionNode,
  memberChain,
  resolveEntityNames,
  unwrapChain,
} from "../util.js";

/** @param {any} node */
function inAnyFunction(node) {
  for (let a = node.parent; a; a = a.parent) if (isFunctionNode(a)) return true;
  return false;
}

export const moduleLevelRead = createRule({
  name: "module-level-read",
  meta: {
    type: "problem",
    docs: { description: "No module-level read of a domain entity (`Booking[0]` at import time is the fixture leaking in)." },
    schema: ENTITY_OPTIONS_SCHEMA,
    messages: { read: "{{name}} is read at module level; a view receives entity data through its ViewModel props" },
  },
  defaultOptions: [/** @type {{ entityNames?: readonly string[] }} */ ({})],
  create(context, [options]) {
    const names = resolveEntityNames(context, options);
    return {
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || !names.has(node.object.name) || inAnyFunction(node)) return;
        // `export type`/import specifiers never contain MemberExpressions; type positions use TSQualifiedName.
        context.report({ node, messageId: "read", data: { name: node.object.name } });
      },
    };
  },
});

/** Attributes whose numeric-only literal is a form/layout value, not a row reference. */
const VALUE_LIKE_ATTRS = new Set([
  "value", "defaultValue", "min", "max", "step", "tabIndex", "rows", "cols", "size",
  "colSpan", "rowSpan", "maxLength", "minLength",
]);
const CONTAINMENT_MIN_ID_LENGTH = 5;

/** @param {string} text */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Fixture-id matching: equality for any id; token-boundary containment for ids of 5+ chars.
 * @param {ReadonlySet<string>} ids
 * @returns {(text: string) => boolean}
 */
export function createFixtureIdMatcher(ids) {
  if (ids.size === 0) return () => false;
  const long = [...ids]
    .filter((id) => id.length >= CONTAINMENT_MIN_ID_LENGTH)
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const contained =
    long.length === 0
      ? null
      : new RegExp(`(?<![A-Za-z0-9_-])(?:${long.map(escapeRegExp).join("|")})(?![A-Za-z0-9_-])`);
  return (text) => ids.has(text) || (contained !== null && contained.test(text));
}

/** The JSX attribute a literal is the value of (directly or through `{…}`). @param {any} node */
function owningAttrName(node) {
  const p = node.parent;
  if (!p) return undefined;
  const attr = p.type === "JSXAttribute" ? p : p.type === "JSXExpressionContainer" && p.parent?.type === "JSXAttribute" ? p.parent : undefined;
  if (!attr) return undefined;
  return attr.name.type === "JSXIdentifier" ? attr.name.name : undefined;
}

export const fixtureIdLiteral = createRule({
  name: "fixture-id-literal",
  meta: {
    type: "problem",
    docs: {
      description:
        "No literal equal to (or embedding) a fixture row id. Needs the `fixtureIds` option (the conversion's fixture prepass supplies it); with the default empty list the rule is a no-op.",
    },
    /** @type {import("@typescript-eslint/utils").JSONSchema.JSONSchema4[]} */
    schema: [
      {
        type: "object",
        properties: { fixtureIds: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: { fixture: '"{{value}}" is a fixture row id; ids come from the ViewModel, never from the view' },
  },
  defaultOptions: [/** @type {{ fixtureIds?: readonly string[] }} */ ({})],
  create(context, [options]) {
    const matches = createFixtureIdMatcher(new Set(options.fixtureIds ?? []));
    /** @param {any} n */
    const skipped = (n) => {
      const t = n.parent?.type;
      return (
        t === "ImportDeclaration" ||
        t === "ExportAllDeclaration" ||
        t === "ExportNamedDeclaration" ||
        t === "TSLiteralType" ||
        t === "TSImportType"
      );
    };
    return {
      Literal(node) {
        if (typeof node.value !== "string" || skipped(node) || !matches(node.value)) return;
        // `<option value="1">` / `min="1"`: a numeric-only id is indistinguishable from a form value.
        const attr = owningAttrName(node);
        if (/^\d+$/.test(node.value) && attr !== undefined && VALUE_LIKE_ATTRS.has(attr)) return;
        context.report({ node, messageId: "fixture", data: { value: node.value } });
      },
      TemplateLiteral(node) {
        for (const q of node.quasis) {
          const value = q.value.cooked;
          if (typeof value === "string" && matches(value)) {
            context.report({ node, messageId: "fixture", data: { value } });
            break; // one finding per template
          }
        }
      },
    };
  },
});

/**
 * A function is NOT render-time when it is an event handler or a `useCallback` body: the clock is
 * read when the user acts, not while rendering. Heuristic by declaration shape (named `handle*` /
 * `on*`, an `on*` JSX attribute value, a `useCallback` argument). `useMemo`/`.map` callbacks run
 * during render and stay in scope.
 * @param {any} fn
 */
function isDeferredFunction(fn) {
  const parent = fn.parent;
  if (!parent) return false;
  if (parent.type === "JSXExpressionContainer" && parent.parent?.type === "JSXAttribute") {
    const n = parent.parent.name;
    return n.type === "JSXIdentifier" && /^on[A-Z]/.test(n.name);
  }
  if (parent.type === "CallExpression") return calleeName(parent) === "useCallback";
  if (parent.type === "VariableDeclarator") {
    return parent.id.type === "Identifier" && /^(handle|on)[A-Z]/.test(parent.id.name);
  }
  if (fn.type === "FunctionDeclaration") return !!fn.id && /^(handle|on)[A-Z]/.test(fn.id.name);
  return false;
}

export const dateInRender = createRule({
  name: "date-in-render",
  meta: {
    type: "problem",
    docs: { description: "No `new Date()` / `Date.now()` / `.toLocale*()` in render: output would depend on the clock/locale." },
    schema: [],
    messages: {
      date: "{{what}} in render makes the output depend on the clock/locale; format through the ViewModel or the i18n layer",
    },
  },
  defaultOptions: [],
  create(context) {
    /** @param {any} node @param {string} what */
    const check = (node, what) => {
      /** @type {any[]} */
      const fns = [];
      for (let a = node.parent; a; a = a.parent) if (isFunctionNode(a)) fns.push(a);
      if (fns.length === 0) return; // module level: module-level rules own it
      fns.reverse(); // outermost (the component) first
      for (const fn of fns.slice(1)) if (isDeferredFunction(fn)) return;
      context.report({ node, messageId: "date", data: { what } });
    };
    return {
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Date" && node.arguments.length === 0) {
          check(node, "new Date()");
        }
      },
      CallExpression(node) {
        const chain = memberChain(unwrapChain(node.callee));
        if (chain === "Date.now") return check(node, "Date.now()");
        const name = calleeName(node);
        if (/\.toLocale\w*$/.test(chain ?? "") || /^toLocale/.test(name ?? "")) check(node, `.${name ?? "toLocale*"}()`);
      },
    };
  },
});

export const noEntitiesFound = createRule({
  name: "no-entities-found",
  meta: {
    type: "problem",
    docs: {
      description:
        "Warns once per file when a view imports a ViewModel but no domain entity names are known (`src/domain/entities/**` missing/moved and no `entityNames` option): the type-aware rules would silently do nothing.",
    },
    schema: ENTITY_OPTIONS_SCHEMA,
    messages: {
      none: "this view imports a ViewModel but no domain entities were found (expected exported types in src/domain/entities/**, or the `entityNames` option): the entity rules (no-entity-derivation, for-loop-over-entity, entity-count*, module-level-read) are INACTIVE for this file",
    },
  },
  defaultOptions: [/** @type {{ entityNames?: readonly string[] }} */ ({})],
  create(context, [options]) {
    let importsVm = false;
    return {
      ImportDeclaration(node) {
        if (String(node.source.value).startsWith("@/application/view-models/")) importsVm = true;
      },
      "Program:exit"(node) {
        if (importsVm && resolveEntityNames(context, options).size === 0) {
          context.report({ node, loc: { line: 1, column: 0 }, messageId: "none" });
        }
      },
    };
  },
});
