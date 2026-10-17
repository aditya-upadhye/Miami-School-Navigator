// @ts-check
import { createRule } from "../util.js";

const TS_DIRECTIVE = /^\s*\*?\s*@ts-(ignore|expect-error|nocheck)\b/m;

/** @param {any} n */
function isAsConst(n) {
  const t = n.typeAnnotation;
  return t && t.type === "TSTypeReference" && t.typeName.type === "Identifier" && t.typeName.name === "const";
}

export const noAsCast = createRule({
  name: "no-as-cast",
  meta: {
    type: "problem",
    docs: { description: "No type assertions in views except `as const` (L38 amendment); includes `<T>x`." },
    schema: [],
    messages: { asCast: "type assertions are banned (only `as const`); fix the type instead of casting" },
  },
  defaultOptions: [],
  create(context) {
    return {
      TSAsExpression(node) {
        if (!isAsConst(node)) context.report({ node, messageId: "asCast" });
      },
      TSTypeAssertion(node) {
        context.report({ node, messageId: "asCast" });
      },
    };
  },
});

export const noAny = createRule({
  name: "no-any",
  meta: {
    type: "problem",
    docs: { description: "Explicit `any` is banned in views." },
    schema: [],
    messages: { any: "explicit `any` is banned" },
  },
  defaultOptions: [],
  create(context) {
    return {
      TSAnyKeyword(node) {
        context.report({ node, messageId: "any" });
      },
    };
  },
});

export const noTsComment = createRule({
  name: "no-ts-comment",
  meta: {
    type: "problem",
    docs: { description: "`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are banned in views." },
    schema: [],
    messages: { tsComment: "`@ts-{{kind}}` is banned: fix the type instead of silencing the compiler" },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program() {
        for (const c of context.sourceCode.getAllComments()) {
          const m = TS_DIRECTIVE.exec(c.value);
          if (m) context.report({ loc: c.loc, messageId: "tsComment", data: { kind: m[1] } });
        }
      },
    };
  },
});
