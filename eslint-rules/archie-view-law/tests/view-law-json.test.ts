import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
// @ts-expect-error plain JS module (JSDoc-typed), no declaration files on purpose
import * as util from "../util.js";

const REPO = resolve(import.meta.dir, "..", "..", "..");
const JSON_PATH = join(REPO, "archie.view-law.json");
const law = JSON.parse(readFileSync(JSON_PATH, "utf8")) as Record<string, unknown>;

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

describe("archie.view-law.json is the single source of the allowlists", () => {
  test("(a) the rule's effective lists equal the JSON", () => {
    const bans = law.importBans as Record<string, string[]>;
    expect([...util.ALLOWED_IMPORT_PREFIXES]).toEqual(law.importPrefixes as string[]);
    expect([...util.ALLOWED_IMPORT_EXACT]).toEqual(law.importExact as string[]);
    expect([...util.ALLOWED_HOOKS]).toEqual(law.hooks as string[]);
    expect({ router: [...util.IMPORT_BANS.router], data: [...util.IMPORT_BANS.data], infra: [...util.IMPORT_BANS.infra] }).toEqual(bans);
    expect(util.VIEW_LAW).toEqual(law);
  });

  test("(b) mutation: a new JSON entry in a temp copy makes that import valid (the rule reads the JSON)", async () => {
    const root = mkdtempSync(join(tmpdir(), "archie-view-law-json-"));
    roots.push(root);
    cpSync(join(REPO, "eslint-rules"), join(root, "eslint-rules"), { recursive: true });
    symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
    const mutated = { ...law, importExact: [...(law.importExact as string[]), "@/lib/brand-new"], hooks: [...(law.hooks as string[]), "useBrandNew"] };
    writeFileSync(join(root, "archie.view-law.json"), JSON.stringify(mutated));

    const copy = await import(pathToFileURL(join(root, "eslint-rules/archie-view-law/index.js")).href);
    const run = (rule: string, code: string) =>
      new Linter().verify(code, [
        { files: ["**/*.tsx"], languageOptions: { parser: tseslint.parser }, plugins: { v: { rules: copy.rules } }, rules: { [`v/${rule}`]: "error" } },
      ], "x.tsx");
    const imp = `import { a } from "@/lib/brand-new";`;
    expect(run("disallowed-import", imp)).toHaveLength(0);
    expect(run("hook-not-allowed", "useBrandNew();")).toHaveLength(0);
    // the real tree still rejects both (control)
    const real = new Linter().verify(imp, [
      { files: ["**/*.tsx"], languageOptions: { parser: tseslint.parser }, plugins: { v: { rules: (await import("../index.js")).rules } }, rules: { "v/disallowed-import": "error" } },
    ], "x.tsx");
    expect(real).toHaveLength(1);
  });

  test("(c) the JSON validates against its schema", () => {
    expect(Object.keys(law).sort()).toEqual(["hooks", "importBans", "importExact", "importPrefixes", "segmentGuard", "version"]);
    expect(typeof law.version).toBe("number");
    expect(isStrings(law.importPrefixes)).toBe(true);
    expect(isStrings(law.importExact)).toBe(true);
    expect(isStrings(law.hooks)).toBe(true);
    expect(typeof law.segmentGuard).toBe("string");
    const bans = law.importBans as Record<string, unknown>;
    expect(Object.keys(bans).sort()).toEqual(["data", "infra", "router"]);
    for (const k of Object.keys(bans)) expect(isStrings(bans[k])).toBe(true);
    expect(law.hooks as string[]).toContain("useReactTable");
    // exact specifiers never end in "/" (that is a directory prefix)
    for (const e of law.importExact as string[]) expect(e.endsWith("/")).toBe(false);
  });
});
