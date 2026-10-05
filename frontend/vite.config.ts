/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// Dev server proxies /api to the API on the host (override with API_URL, default http://localhost:8080);
// production uses nginx (frontend/nginx.conf). Vitest runs pure-module and Pinia store tests in Node.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_URL || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  }
})
