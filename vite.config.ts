import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { seoHtml } from './scripts/seoHtml'

/** After the build, list every file in dist and write dist/sw.js so the app can be stored for offline use. */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'rapidbill-service-worker',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; root = c.root },
    closeBundle() {
      const dir = join(root, outDir)
      const files: string[] = []
      const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(relative(dir, p)) } }
      walk(dir)
      // Fonts ship in many alphabets; only store the ones this app uses (Latin and Devanagari, modern format).
      const wantedFont = (f: string) => !/\.woff2?$/.test(f) || (f.endsWith('.woff2') && /-(latin|latin-ext|devanagari)-\d+-normal/.test(f))
      const list = files.filter((f) => f !== 'sw.js' && f !== '404.html' && !f.endsWith('.map') && wantedFont(f)).sort()
      const hash = createHash('sha256')
      for (const f of list) hash.update(f).update(readFileSync(join(dir, f)))
      const src = readFileSync(join(root, 'scripts/sw.template.js'), 'utf8')
        .replaceAll('__VERSION__', hash.digest('hex').slice(0, 12))
        .replaceAll('__PRECACHE__', JSON.stringify(['.', ...list]))
      writeFileSync(join(dir, 'sw.js'), src)
    },
  }
}

// GitHub Pages serves the site under /<repo>/, so production builds use that base by default; the dev server stays at /.
// A server that hosts the app at the domain root (e.g. Caddy on EC2) builds with VITE_BASE=/.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' ? '/rapidbill-fe/' : '/'),
  plugins: [react(), seoHtml(), serviceWorker()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}))
