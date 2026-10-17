import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findCollisions, formatCollision, oneModulePerSpecifier } from "./one-module-per-specifier";

let root: string;
const views = () => join(root, "src/presentation/views");
const put = (rel: string, body = "export default null;\n") => {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
};
const PLAN_CARD = 'export default function V() { return <section data-archie-plan-card="v1" />; }\n';

beforeEach(() => {
  // PRIV (mktemp -d) is exported by the caller as TMPDIR for the run.
  root = mkdtempSync(join(tmpdir(), "omps-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function build(command: "build" | "serve") {
  const errors: string[] = [];
  // The hooks are called directly, outside Vite: a plain function view of each one.
  const plugin = oneModulePerSpecifier() as unknown as {
    configResolved: (c: unknown) => void;
    buildStart: () => void;
    configureServer: (s: unknown) => void;
    resolveId: (importee: string, importer?: string) => unknown;
  };
  plugin.configResolved({ root, command, logger: { error: (m: string) => errors.push(m) } });
  return { plugin, errors };
}

describe("one-module-per-specifier rule", () => {
  it(".jsx + .tsx throws on build and names both paths", () => {
    put("src/presentation/views/signup.view.jsx", PLAN_CARD);
    put("src/presentation/views/signup.view.d.ts");
    put("src/presentation/views/signup.view.tsx");
    const { plugin } = build("build");
    let msg = "";
    try {
      plugin.buildStart();
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe(
      [
        '[archie] one module per view: two files resolve to the same import "./presentation/views/signup.view"',
        "  src/presentation/views/signup.view.jsx  (+ signup.view.d.ts)",
        "  src/presentation/views/signup.view.tsx",
        "Vite and tsc disagree on which file that import gets, so the app is broken either way.",
        "Fix: signup.view.jsx is an unbuilt skeleton screen, built by screen generation, never by hand. If you",
        "wrote signup.view.tsx by hand, delete it and ask Archie to generate this screen.",
      ].join("\n"),
    );
  });

  it(".jsx + .d.ts passes", () => {
    put("src/presentation/views/a.view.jsx");
    put("src/presentation/views/a.view.d.ts");
    expect(findCollisions(join(root, "src"))).toEqual([]);
    expect(() => build("build").plugin.buildStart()).not.toThrow();
  });

  it(".tsx + .d.ts throws and names the .d.ts as the fix", () => {
    put("src/presentation/views/a.view.tsx");
    put("src/presentation/views/a.view.d.ts");
    const found = findCollisions(join(root, "src"));
    expect(found.length).toBe(1);
    expect(formatCollision(found[0], root).split("\n").at(-1)).toBe(
      "Fix: delete a.view.d.ts (a .tsx module carries its own types).",
    );
    expect(() => build("build").plugin.buildStart()).toThrow(/one module per view/);
  });

  it("a REAL (transplanted) .jsx view beside a hand .tsx is never called a skeleton", () => {
    put("src/presentation/views/orders.view.jsx", "export function OrdersView() { return <main />; }\n");
    put("src/presentation/views/orders.view.d.ts");
    put("src/presentation/views/orders.view.tsx");
    const [c] = findCollisions(join(root, "src"));
    const msg = formatCollision(c, root);
    expect(msg).not.toContain("skeleton");
    expect(msg.split("\n").at(-1)).toBe("Fix: keep exactly one of them.");
  });

  it("a placeholder .tsx (marker) beside another module names the placeholder as the skeleton", () => {
    put("src/presentation/views/b.view.tsx", 'export default function P() { return <div data-archie-placeholder="sin-convertir" />; }\n');
    put("src/presentation/views/b.view.jsx", "export function BView() { return <main />; }\n");
    const [c] = findCollisions(join(root, "src"));
    expect(formatCollision(c, root)).toContain("b.view.tsx is an unbuilt skeleton screen");
    expect(formatCollision(c, root)).toContain("wrote b.view.jsx by hand");
  });

  it("the template's own src/** has no collision", () => {
    expect(findCollisions(join(import.meta.dir, "..", "src"))).toEqual([]);
  });

  it("a lone .d.ts passes", () => {
    put("src/types/global.d.ts");
    expect(findCollisions(join(root, "src"))).toEqual([]);
  });

  it("non-view pairs get the generic fix line", () => {
    put("src/lib/util.js");
    put("src/lib/util.ts");
    const [c] = findCollisions(join(root, "src"));
    const lines = formatCollision(c, root).split("\n");
    expect(lines[0]).toContain('same import "./lib/util"');
    expect(lines[0]).toContain("one module per specifier");
    expect(lines.at(-1)).toBe("Fix: keep exactly one of them.");
  });

  it("skips node_modules and dist", () => {
    put("src/node_modules/x/a.js");
    put("src/node_modules/x/a.ts");
    put("src/dist/a.js");
    put("src/dist/a.ts");
    expect(findCollisions(join(root, "src"))).toEqual([]);
  });

  it("serving logs and resolveId throws only for the collided base", () => {
    put("src/presentation/views/a.view.jsx");
    put("src/presentation/views/a.view.tsx");
    put("src/presentation/views/ok.view.tsx");
    const { plugin, errors } = build("serve");
    expect(() => plugin.buildStart()).not.toThrow();
    expect(errors.length).toBe(1);
    const importer = join(root, "src/routes.config.tsx");
    expect(() => plugin.resolveId("./presentation/views/a.view", importer)).toThrow(/one module per view/);
    expect(plugin.resolveId("./presentation/views/ok.view", importer)).toBeNull();
    expect(() => plugin.resolveId("@/presentation/views/a.view", importer)).toThrow();
  });

  it("dev re-scans on watcher add", () => {
    put("src/presentation/views/a.view.jsx");
    const { plugin, errors } = build("serve");
    plugin.buildStart();
    const watcher = new EventEmitter();
    const serverErrors: string[] = [];
    plugin.configureServer({ watcher, config: { logger: { error: (m: string) => serverErrors.push(m) } } });
    expect(errors.length).toBe(0);
    put("src/presentation/views/a.view.tsx");
    watcher.emit("add", join(views(), "a.view.tsx"));
    expect(serverErrors.length).toBe(1);
    expect(() => plugin.resolveId("./presentation/views/a.view", join(root, "src/r.tsx"))).toThrow();
    rmSync(join(views(), "a.view.tsx"));
    watcher.emit("unlink", join(views(), "a.view.tsx"));
    expect(plugin.resolveId("./presentation/views/a.view", join(root, "src/r.tsx"))).toBeNull();
  });
});

describe("vite.config.ts", () => {
  it("registers the plugin first", () => {
    const src = readFileSync(join(import.meta.dir, "../vite.config.ts"), "utf8");
    const plugins = src.slice(src.indexOf("plugins: ["));
    expect(plugins.slice("plugins: [".length).trimStart().startsWith("oneModulePerSpecifier()")).toBe(true);
  });
});
