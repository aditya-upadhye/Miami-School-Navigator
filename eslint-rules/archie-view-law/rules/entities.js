// @ts-check
/**
 * V3b — type-aware rules over arrays of domain entities. Decided on TYPES (the checker), never on
 * names: `readonly Booking[]`, `Booking[]`, `ReadonlyArray<Booking>` and nullable forms all
 * resolve. Requires `parserOptions.projectService` (or `project`) on the linted files.
 */
import {
  ENTITY_OPTIONS_SCHEMA,
  calleeName,
  createRule,
  entityArrayDetector,
  lengthObjectOf,
  memberChain,
  unwrapChain,
} from "../util.js";

/** Methods that derive from an entity array (page-1 math in disguise). `.map` alone is rendering. */
export const DERIVING_METHODS = new Set([
  "filter",
  "reduce",
  "sort",
  "find",
  "some",
  "every",
  "flatMap",
  "toSorted",
  "toReversed",
  "findLast",
  "findIndex",
  "findLastIndex",
  "includes",
  "forEach",
]);
const MAP_FOLD_METHODS = new Set(["reduce", "reduceRight"]);
const MATH_FOLDS = new Set(["Math.max", "Math.min"]);
const FLIPPED_OP = /** @type {Record<string, string>} */ ({ ">": "<", "<": ">", ">=": "<=", "<=": ">=" });

const DOCS_TYPED = { requiresTypeChecking: true };
/** @type {[{ entityNames?: readonly string[] }]} */
const DEFAULTS = [{}];

/** @param {any} n */
function isMember(n) {
  return n.type === "MemberExpression";
}

export const noEntityDerivation = createRule({
  name: "no-entity-derivation",
  meta: {
    type: "problem",
    docs: {
      description:
        "No filter/reduce/sort/find/… (nor a `.map()` folded by reduce / Math.max/min) over an array of domain entities in a view.",
      ...DOCS_TYPED,
    },
    schema: ENTITY_OPTIONS_SCHEMA,
    messages: {
      derive:
        ".{{method}}() over {{entity}}[]: derive in a selector/aggregate provisioned by the plan, not in the view (page-1 math is wrong once the list is paginated)",
      fold: ".map() over {{entity}}[] feeding {{into}}: that is a derivation (page-1 math), not rendering",
    },
  },
  defaultOptions: DEFAULTS,
  create(context, [options]) {
    const entityArrayOf = entityArrayDetector(context, options);
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const method = calleeName(node);
        if (method === undefined) return;
        if (DERIVING_METHODS.has(method)) {
          const entity = entityArrayOf(callee.object);
          if (entity !== undefined) context.report({ node, messageId: "derive", data: { method, entity } });
          return;
        }
        if (method !== "map") return;
        const entity = entityArrayOf(callee.object);
        if (entity === undefined) return;
        // Skip `?.` wrappers so `rows.map(..)?.reduce` / `Math.max(...)` are seen through them.
        let child = /** @type {any} */ (node);
        let parent = /** @type {any} */ (node.parent);
        while (parent && parent.type === "ChainExpression") {
          child = parent;
          parent = parent.parent;
        }
        const foldedByMember =
          parent &&
          isMember(parent) &&
          parent.object === child &&
          !parent.computed &&
          parent.property.type === "Identifier" &&
          MAP_FOLD_METHODS.has(parent.property.name);
        /** @param {any} c */
        const mathCall = (c) =>
          c !== undefined &&
          c !== null &&
          c.type === "CallExpression" &&
          MATH_FOLDS.has(memberChain(unwrapChain(c.callee)) ?? "");
        const foldedByMath = mathCall(parent) || (parent?.type === "SpreadElement" && mathCall(parent.parent));
        if (foldedByMember || foldedByMath) {
          context.report({
            node,
            messageId: "fold",
            data: { entity, into: foldedByMember ? ".reduce" : "Math.max/min" },
          });
        }
      },
    };
  },
});

export const forLoopOverEntity = createRule({
  name: "for-loop-over-entity",
  meta: {
    type: "problem",
    docs: { description: "No `for…of` over an entity array, nor a `for` bounded by `<entity array>.length`.", ...DOCS_TYPED },
    schema: ENTITY_OPTIONS_SCHEMA,
    messages: {
      forOf:
        "for…of over {{entity}}[]: loops over an entity array are page-1 math in disguise; render with .map or use a ViewModel member",
      forBound:
        "for loop bounded by {{entity}}[].length: loops over an entity array are page-1 math in disguise; render with .map or use a ViewModel member",
    },
  },
  defaultOptions: DEFAULTS,
  create(context, [options]) {
    const entityArrayOf = entityArrayDetector(context, options);
    return {
      ForOfStatement(node) {
        const entity = entityArrayOf(node.right);
        if (entity !== undefined) context.report({ node, messageId: "forOf", data: { entity } });
      },
      ForStatement(node) {
        if (!node.test) return;
        let entity = /** @type {string | undefined} */ (undefined);
        visitLengths(node.test, (obj) => {
          entity ??= entityArrayOf(obj);
        });
        if (entity !== undefined) context.report({ node, messageId: "forBound", data: { entity } });
      },
    };
  },
});

/** Visit every `<obj>.length` inside an expression subtree. @param {any} root @param {(obj: any) => void} cb */
function visitLengths(root, cb) {
  const seen = new Set();
  const go = (/** @type {any} */ n) => {
    if (!n || typeof n.type !== "string" || seen.has(n)) return;
    seen.add(n);
    const obj = lengthObjectOf(n);
    if (obj) cb(obj);
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach(go);
      else if (v && typeof v === "object") go(v);
    }
  };
  go(root);
}

/**
 * Is the `.length` member `n` used ONLY as an emptiness test? `=== 0`, `== 0`, `!== 0`, `!= 0`,
 * `> 0`, `>= 1`, `< 1` (either operand order), `!x.length`, or a direct boolean (if/while/ternary
 * test, left operand of `&&`/`||`).
 * @param {any} node
 */
export function isEmptinessUse(node) {
  // `!props.rows?.length`: the optional chain wraps the member in a ChainExpression; judge the wrapper.
  let n = node;
  while (n.parent && n.parent.type === "ChainExpression") n = n.parent;
  const parent = n.parent;
  if (!parent) return false;
  switch (parent.type) {
    case "UnaryExpression":
      return parent.operator === "!";
    case "IfStatement":
    case "WhileStatement":
    case "ConditionalExpression":
      return parent.test === n;
    case "LogicalExpression":
      return (parent.operator === "&&" || parent.operator === "||") && parent.left === n;
    case "BinaryExpression": {
      let op = parent.operator;
      const other = parent.left === n ? parent.right : parent.left;
      if (parent.left !== n) op = FLIPPED_OP[op] ?? op; // `0 < rows.length` is `rows.length > 0`
      if (other.type !== "Literal" || typeof other.value !== "number") return false;
      const v = other.value;
      if (op === "===" || op === "==" || op === "!==" || op === "!=") return v === 0;
      if (op === ">") return v === 0;
      if (op === ">=") return v === 1;
      if (op === "<") return v === 1;
      return false;
    }
    default:
      return false;
  }
}

/** The `for` whose TEST contains `node`, if any (its `.length` is already the for-loop finding). @param {any} node */
function inForTest(node) {
  for (let a = node.parent; a; a = a.parent) {
    if (a.type === "ForStatement" && a.test && a.test.range[0] <= node.range[0] && node.range[1] <= a.test.range[1]) return true;
    if (a.type === "Program") return false;
  }
  return false;
}

/** @param {"entity-count" | "entity-count-empty-check"} kind */
function countRule(kind) {
  const emptyKind = kind === "entity-count-empty-check";
  return createRule({
    name: kind,
    meta: {
      type: "suggestion",
      docs: {
        description: emptyKind
          ? "MEASURED (warn): `.length` of an entity array used only as an emptiness test; prefer the ViewModel's empty flag."
          : "MEASURED (warn): any other `.length` use of an entity array counts one page, not the collection.",
        ...DOCS_TYPED,
      },
      schema: ENTITY_OPTIONS_SCHEMA,
      messages: emptyKind
        ? { count: "{{entity}}[].length used as an emptiness test (measured, non-blocking); prefer the ViewModel's empty flag" }
        : { count: "{{entity}}[].length counts one page, not the collection; use the ViewModel's total/count member" },
    },
    defaultOptions: DEFAULTS,
    create(context, [options]) {
      const entityArrayOf = entityArrayDetector(context, options);
      return {
        MemberExpression(node) {
          const obj = lengthObjectOf(node);
          if (!obj || inForTest(node)) return;
          // `x.filter(…).length`: the derivation is already the finding; do not report it twice.
          const inner = unwrapChain(obj);
          if (inner.type === "CallExpression" && DERIVING_METHODS.has(calleeName(inner) ?? "")) return;
          if (isEmptinessUse(node) !== emptyKind) return;
          const entity = entityArrayOf(obj);
          if (entity !== undefined) context.report({ node, messageId: "count", data: { entity } });
        },
      };
    },
  });
}

export const entityCount = countRule("entity-count");
export const entityCountEmptyCheck = countRule("entity-count-empty-check");
