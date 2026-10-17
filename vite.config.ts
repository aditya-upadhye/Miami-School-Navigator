import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { archieDevTools } from "@archie/devtools";
import { oneModulePerSpecifier } from "./vite-plugins/one-module-per-specifier";


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    oneModulePerSpecifier(),
    react(),
    archieDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    // Previews are served under dynamic hosts (<projectId>.<previewDomainBase>)
    // behind Archie's router; baking this in keeps it stable across gv2 re-syncs.
    // Vite 8 falls back `preview.allowedHosts` to this same list
    // (`preview?.allowedHosts ?? server.allowedHosts`), so `vite preview` on a
    // dev's laptop inherits it too — `true` would reopen the DNS-rebinding
    // vector over `/@fs/` there. archie-preview-worker's agent.js hot-patches
    // `allowedHosts: true` into projects that lack the key at all
    // (`if (content.includes('allowedHosts')) return;`), so it never touches
    // this file — this explicit list is what actually governs the running pod.
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.previews.dev.archie-platform.com',
      '.previews.staging.archie-platform.com',
      '.previews.archie.com',
    ],
  },
  // MUST stay an explicit key. archie-preview-worker's agent.js
  // `patchViteOptimizeDeps` does `if (content.includes('optimizeDeps')) return;`
  // and otherwise injects `optimizeDeps.include = [EVERY package.json dependency]`.
  // That list contains `@shadcn/react` (no "." export, only subpaths) and the
  // `shadcn` CLI, which make Vite 8 / rolldown fail ("." is not exported /
  // MISSING_EXPORT toPath) -> vite exits 1 -> preview 502. An empty include keeps
  // the worker's hands off; Vite's startup dep scanner still pre-bundles every
  // dependency the app actually imports (incl. `@shadcn/react/<subpath>`).
  optimizeDeps: {
    include: [],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    target: "esnext",
  },
});
