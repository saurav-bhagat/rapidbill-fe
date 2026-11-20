import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site under /<repo>/, so production builds use that base by default; the dev server stays at /.
// A server that hosts the app at the domain root (e.g. nginx on EC2) builds with VITE_BASE=/.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' ? '/rapidbill-fe/' : '/'),
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}))
