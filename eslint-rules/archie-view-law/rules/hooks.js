// @ts-check
import { ALLOWED_HOOKS, calleeName, createRule } from "../util.js";

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);
const HOOK_NAME = /^use[A-Z]/;

/** @param {"no-use-effect" | "hook-not-allowed"} kind */
function hookRule(kind) {
  return createRule({
    name: kind,
    meta: {
      type: "problem",
      docs: {
        description:
          kind === "no-use-effect"
            ? "Views never call useEffect/useLayoutEffect: loading, subscriptions and timers belong to the container."
            : "Views may only call the allowlisted hooks.",
      },
      schema: [],
      messages:
        kind === "no-use-effect"
          ? { banned: "{{name}} is banned: loading, subscriptions and timers belong to the container" }
          : {
              banned:
                "{{name}} is not in the view hook allowlist ({{allowlist}})",
            },
    },
    defaultOptions: [],
    create(context) {
      return {
        CallExpression(node) {
          const name = calleeName(node);
          if (name === undefined || !HOOK_NAME.test(name)) return;
          const isEffect = EFFECT_HOOKS.has(name);
          if (kind === "no-use-effect" ? !isEffect : isEffect || ALLOWED_HOOKS.includes(name)) return;
          context.report({
            node,
            messageId: "banned",
            data: { name, allowlist: ALLOWED_HOOKS.join(", ") },
          });
        },
      };
    },
  });
}

export const noUseEffect = hookRule("no-use-effect");
export const hookNotAllowed = hookRule("hook-not-allowed");
