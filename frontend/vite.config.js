import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev and `vite preview`, /api is proxied to the backend so the browser never needs CORS.
// For a deployed build, set VITE_API_BASE_URL to the public API URL (see .env.example).
const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:8000';
const proxy = { '/api': { target: API_TARGET, changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
