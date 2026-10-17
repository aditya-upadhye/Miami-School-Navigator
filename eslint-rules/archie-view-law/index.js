// @ts-check
/**
 * eslint-plugin-archie-view-law (LOCAL — it lives in the template, travels with every generated
 * repo and is not published). Enforces L38 / the conversion's V1-V3 "view law": a view renders
 * what the ViewModel hands it and calls the callbacks it was given.
 *
 * Use `viewLawConfig()` from `eslint.config.js`; it wires the plugin to `VIEW_GLOBS` with the
 * right severities. See README.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VIEW_GLOBS, VIEW_IGNORES } from "./view-globs.js";
import { hookNotAllowed, noUseEffect } from "./rules/hooks.js";
import { dataImport, disallowedImport, infraImport, routerImport, vmValueImport } from "./rules/imports.js";
import { noAny, noAsCast, noTsComment } from "./rules/types.js";
import {
  entityCount,
  entityCountEmptyCheck,
  forLoopOverEntity,
  noEntityDerivation,
} from "./rules/entities.js";
import { dateInRender, fixtureIdLiteral, moduleLevelRead, noEntitiesFound } from "./rules/render.js";

export { VIEW_GLOBS, VIEW_IGNORES };
export { ALLOWED_HOOKS, ALLOWED_IMPORT_EXACT, ALLOWED_IMPORT_PREFIXES } from "./util.js";

export const rules = {
  "no-use-effect": noUseEffect,
  "hook-not-allowed": hookNotAllowed,
  "router-import": routerImport,
  "data-import": dataImport,
  "infra-import": infraImport,
  "disallowed-import": disallowedImport,
  "vm-value-import": vmValueImport,
  "no-entity-derivation": noEntityDerivation,
  "for-loop-over-entity": forLoopOverEntity,
  "entity-count": entityCount,
  "entity-count-empty-check": entityCountEmptyCheck,
  "module-level-read": moduleLevelRead,
  "date-in-render": dateInRender,
  "fixture-id-literal": fixtureIdLiteral,
  "no-entities-found": noEntitiesFound,
  "no-as-cast": noAsCast,
  "no-any": noAny,
  "no-ts-comment": noTsComment,
};

/** The two MEASURED codes: warnings, never blocking (page-1 `.length` is common in list screens). */
export const MEASURED_RULES = Object.freeze(["entity-count", "entity-count-empty-check", "no-entities-found"]);

export const plugin = { meta: { name: "eslint-plugin-archie-view-law", version: "1.0.0" }, rules };

/**
 * Severity per rule: every rule is an error except the two measured `.length` rules (warn).
 * @param {{ entityNames?: readonly string[]; fixtureIds?: readonly string[] }} [options]
 */
export function viewLawRules(options = {}) {
  /** @type {Record<string, any>} */
  const out = {};
  const entityOpts = options.entityNames ? [{ entityNames: options.entityNames }] : [];
  for (const name of Object.keys(rules)) {
    const severity = MEASURED_RULES.includes(name) ? "warn" : "error";
    /** @type {any[]} */
    let opts = [];
    if (["no-entity-derivation", "for-loop-over-entity", "entity-count", "entity-count-empty-check", "module-level-read", "no-entities-found"].includes(name)) opts = entityOpts;
    if (name === "fixture-id-literal" && options.fixtureIds) opts = [{ fixtureIds: options.fixtureIds }];
    out[`archie-view-law/${name}`] = [severity, ...opts];
  }
  return out;
}

/** Repo-root file gv2 can drop in to feed `fixture-id-literal` without editing any eslint config. */
export const FIXTURES_FILE = "archie-view-law.fixtures.json";

/**
 * Fixture ids from a JSON file: either `["b1", ...]` or `{ "fixtureIds": ["b1", ...] }`. A missing or
 * unreadable file yields `undefined` (the rule stays a no-op).
 * @param {string} [file] defaults to `<repo root>/archie-view-law.fixtures.json`
 * @returns {string[] | undefined}
 */
export function loadFixtureIds(file) {
  const path = file ?? fileURLToPath(new URL(`../../${FIXTURES_FILE}`, import.meta.url));
  if (!existsSync(path)) return undefined;
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    const ids = Array.isArray(json) ? json : json?.fixtureIds;
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Flat-config block for the views. `files` defaults to `VIEW_GLOBS`; the type-aware rules need
 * `parserOptions.projectService`, which the caller's base TS block already provides.
 * @param {{ files?: readonly string[]; ignores?: readonly string[]; entityNames?: readonly string[]; fixtureIds?: readonly string[]; fixturesFile?: string }} [options]
 */
export function viewLawConfig(options = {}) {
  const fixtureIds = options.fixtureIds ?? loadFixtureIds(options.fixturesFile);
  return {
    files: [...(options.files ?? VIEW_GLOBS)],
    ignores: [...(options.ignores ?? VIEW_IGNORES)],
    plugins: { "archie-view-law": plugin },
    rules: viewLawRules({ ...options, fixtureIds }),
  };
}

export default plugin;
