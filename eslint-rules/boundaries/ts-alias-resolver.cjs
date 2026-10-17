/**
 * Minimal `import/resolver` (eslint-module-utils interface v2) for eslint-plugin-boundaries.
 * Resolves RELATIVE specifiers and the template's `@/*` -> `src/*` alias to real files; every other
 * specifier (bare packages) answers `{ found: false }`, which the plugin classifies as EXTERNAL
 * (`flagAsExternal.unresolvableAlias`) — exactly what we want for react, @archie/*, axios, ...
 *
 * CommonJS on purpose: eslint-module-utils loads resolvers with `require`.
 * No extra dependency (no eslint-import-resolver-typescript) so the lint travels light with the repo.
 */
const fs = require("node:fs");
const path = require("node:path");

const EXTENSIONS = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"];

/** @param {string} p */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} base @returns {string | null} */
function tryResolve(base) {
  if (isFile(base)) return base;
  for (const ext of EXTENSIONS) if (isFile(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) if (isFile(path.join(base, "index" + ext))) return path.join(base, "index" + ext);
  return null;
}

exports.interfaceVersion = 2;

/** @param {string} source @param {string} file @param {{ srcRoot?: string } | undefined} config */
exports.resolve = function resolve(source, file, config) {
  const srcRoot = (config && config.srcRoot) || path.join(process.cwd(), "src");
  /** @type {string} */
  let base;
  if (source.startsWith("@/")) base = path.join(srcRoot, source.slice(2));
  else if (source.startsWith("./") || source.startsWith("../") || source === "." || source === "..") {
    base = path.resolve(path.dirname(file), source);
  } else return { found: false };
  const found = tryResolve(base);
  return found ? { found: true, path: found } : { found: false };
};
