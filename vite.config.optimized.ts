import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc' // 🚀 SWC es 20x más rápido que Babel
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // 🚀 SWC no necesita configuración de Babel
      // React Dev Inspector se puede agregar después si es necesario
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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

  // 🚀 OPTIMIZACIONES DE BUILD
  build: {
    outDir: 'dist',
    sourcemap: false, // ✅ Ya estaba deshabilitado (bueno para producción)
    minify: 'esbuild', // ✅ Ya estaba usando esbuild (el más rápido)
    target: 'esnext', // ✅ Ya estaba optimizado

    // 🚀 NEW: Deshabilitar CSS code splitting (más rápido)
    cssCodeSplit: false,

    // 🚀 NEW: Aumentar el límite de warning para chunks grandes
    chunkSizeWarningLimit: 1000, // 1MB (evita warnings molestos)

    // 🚀 NEW: Rollup optimizations
    rollupOptions: {
      output: {
        // Code splitting manual para mejor cache
        manualChunks: {
          // Vendor chunks separados = mejor cache del navegador
          'react-vendor': ['react', 'react-dom', 'react-router'],
          'ui-vendor': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-aspect-ratio',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'form-vendor': ['react-hook-form', 'zod', '@hookform/resolvers'],
        },
      },
    },

    // 🚀 NEW: Reportar progreso comprimido
    reportCompressedSize: false, // Deshabilitar para builds más rápidos

    // 🚀 NEW: Configurar terser (opcional, esbuild es más rápido)
    // Si necesitas máxima compresión, usa terser:
    // minify: 'terser',
    // terserOptions: {
    //   compress: {
    //     drop_console: true, // Remover console.log en producción
    //   },
    // },
  },

  // 🚀 NEW: Pre-bundling optimization
  optimizeDeps: {
    // Especificar dependencias a pre-bundlear (más rápido)
    include: [
      'react',
      'react-dom',
      'react-router',
      'react-hook-form',
      'zod',
      '@hookform/resolvers/zod',
      'i18next',
      'react-i18next',
      'clsx',
      'tailwind-merge',
    ],
    // 🚀 NEW: Usar esbuild para pre-bundling (ya es el default, pero explícito)
    esbuildOptions: {
      target: 'esnext',
    },
  },

  // 🚀 NEW: Configuración de caché (mejora builds sucesivos)
  cacheDir: 'node_modules/.vite',
})

