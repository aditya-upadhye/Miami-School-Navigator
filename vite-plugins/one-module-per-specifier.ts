import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * ARCH-2335 — one module per import specifier.
 *
 * `routes.config.tsx` lazy-imports `./presentation/views/<slug>.view` with no extension. Vite
 * resolves `.jsx` before `.tsx`, and `tsc` collides a `.d.ts` with a `.ts`/`.tsx` of the same base,
 * so a second file on the same base breaks the app either way. This plugin refuses that state.
 *
 * Rule over `src/**`: group files by basename-minus-extension over {js,jsx,mjs,cjs,ts,tsx,mts,cts}.
 *  - two source modules on one base            => error
 *  - `<base>.d.ts` beside .ts/.tsx/.mts        => error
 *  - `<base>.d.ts` beside .jsx/.js             => allowed (the sanctioned skeleton pair)
 *  - a lone `<base>.d.ts`                      => allowed
 */

const SOURCE_EXTS = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"] as const;
const JS_EXTS = new Set(["js", "jsx", "mjs", "cjs"]);
const TS_EXTS = new Set(["ts", "tsx", "mts", "cts"]);
const SKIP_DIRS = new Set(["node_modules", "dist"]);

export interface Collision {
  /** Absolute path of the shared base, no extension. */
  base: string;
  /** Absolute paths of the colliding source modules (JS family first). */
  sources: string[];
  /** Absolute path of the `<base>.d.ts`, when present. */
  dts?: string;
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(join(dir, e.name));
    }
  }
}

export function findCollisions(srcDir: string): Collision[] {
  const files: string[] = [];
  walk(srcDir, files);
  const groups = new Map<string, { sources: string[]; dts?: string }>();
  for (const file of files.sort()) {
    const name = basename(file);
    let base: string | undefined;
    let isDts = false;
    if (name.endsWith(".d.ts")) {
      base = file.slice(0, -".d.ts".length);
      isDts = true;
    } else {
      const ext = SOURCE_EXTS.find((x) => name.endsWith(`.${x}`));
      if (ext) base = file.slice(0, -(ext.length + 1));
    }
    if (!base) continue;
    const g = groups.get(base) ?? { sources: [] };
    if (isDts) g.dts = file;
    else g.sources.push(file);
    groups.set(base, g);
  }
  const extOf = (f: string) => f.slice(f.lastIndexOf(".") + 1);
  const out: Collision[] = [];
  for (const [base, g] of groups) {
    const tsSource = g.sources.some((s) => TS_EXTS.has(extOf(s)));
    const collides = g.sources.length > 1 || (g.dts !== undefined && tsSource);
    if (!collides) continue;
    const sources = [...g.sources].sort(
      (a, b) => Number(!JS_EXTS.has(extOf(a))) - Number(!JS_EXTS.has(extOf(b))) || a.localeCompare(b),
    );
    out.push({ base, sources, dts: g.dts });
  }
  return out;
}

const SKELETON_MARKER = /data-archie-(plan-card|placeholder)=/;

/** A plan card (`data-archie-plan-card`) or a scaffold placeholder (`data-archie-placeholder`); unreadable ⇒ not a skeleton. */
function isSkeletonModule(file: string): boolean {
  try {
    return SKELETON_MARKER.test(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

export function formatCollision(c: Collision, root: string): string {
  const srcDir = join(root, "src");
  const rel = (p: string) => relative(root, p).split(sep).join("/");
  const specifier = "./" + relative(srcDir, c.base).split(sep).join("/");
  const base = basename(c.base);
  const isView = base.endsWith(".view");
  const [first, ...rest] = c.sources;
  const dtsOnFirst = c.dts !== undefined && JS_EXTS.has(first.slice(first.lastIndexOf(".") + 1));
  const firstLine = `  ${rel(first)}${dtsOnFirst ? `  (+ ${basename(c.dts ?? "")})` : ""}`;
  const lines = [
    `[archie] one module per ${isView ? "view" : "specifier"}: two files resolve to the same import "${specifier}"`,
    firstLine,
    ...rest.map((s) => `  ${rel(s)}`),
  ];
  if (c.dts && !dtsOnFirst) lines.push(`  ${rel(c.dts)}`);
  lines.push("Vite and tsc disagree on which file that import gets, so the app is broken either way.");
  if (isView) {
    // A skeleton is recognised by its MARKER, never by its extension: a real transplanted screen is also `.jsx` + `.d.ts`.
    const skeletons = c.sources.filter(isSkeletonModule);
    const others = c.sources.filter((s) => !skeletons.includes(s));
    if (skeletons.length === 1 && others.length > 0) {
      const names = others.map((s) => basename(s)).join(", ");
      lines.push(
        `Fix: ${basename(skeletons[0])} is an unbuilt skeleton screen, built by screen generation, never by hand. If you`,
        `wrote ${names} by hand, delete it and ask Archie to generate this screen.`,
      );
    } else if (c.dts && c.sources.length === 1) {
      lines.push(`Fix: delete ${base}.d.ts (a ${basename(c.sources[0]).slice(base.length)} module carries its own types).`);
    } else {
      lines.push("Fix: keep exactly one of them.");
    }
  } else {
    lines.push("Fix: keep exactly one of them.");
  }
  return lines.join("\n");
}

export function oneModulePerSpecifier(): Plugin {
  let root = process.cwd();
  let isBuild = false;
  let logger: ResolvedConfig["logger"] | undefined;
  let collided = new Map<string, string>();

  const scan = () => {
    const found = findCollisions(join(root, "src"));
    collided = new Map(found.map((c) => [c.base, formatCollision(c, root)]));
    return found;
  };

  return {
    name: "archie:one-module-per-specifier",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      isBuild = config.command === "build";
      logger = config.logger;
    },
    buildStart() {
      scan();
      if (collided.size === 0) return;
      const msg = [...collided.values()].join("\n\n");
      if (isBuild) throw new Error(msg);
      logger?.error(msg);
    },
    configureServer(server) {
      const onChange = (file: string) => {
        if (!resolve(file).startsWith(join(root, "src") + sep)) return;
        const before = new Set(collided.values());
        scan();
        for (const msg of collided.values()) if (!before.has(msg)) server.config.logger.error(msg);
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
    resolveId(importee, importer) {
      if (isBuild || collided.size === 0) return null;
      let abs: string | undefined;
      if (importee.startsWith("@/")) abs = join(root, "src", importee.slice(2));
      else if (importee.startsWith(".") && importer) abs = resolve(dirname(importer.split("?")[0]), importee);
      if (!abs) return null;
      abs = abs.replace(/\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/, "");
      const msg = collided.get(abs);
      if (msg) throw new Error(msg);
      return null;
    },
  };
}

export default oneModulePerSpecifier;
