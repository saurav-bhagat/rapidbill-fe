import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site under /<repo>/, so production builds use that base; the dev server stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/rapidbill-fe/' : '/',
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}))
