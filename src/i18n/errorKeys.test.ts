import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './locales/en/errors.json'
import hi from './locales/hi/errors.json'

const walk = (dir: string, out: string[] = []) => {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue
    const p = join(dir, f)
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && out.push(p)
  }
  return out
}
const keysIn = (files: string[], patterns: RegExp[]) => {
  const found = new Map<string, string>()
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const re of patterns) for (const m of text.matchAll(re)) found.set(m[1]!, f)
  }
  return found
}

describe('every error message the app can raise has a translation', () => {
  it('frontend: every AppError / BillingError / fail() key is in the English and Hindi catalogue', () => {
    const files = walk(join(__dirname, '..'))
    const used = keysIn(files, [/new (?:AppError|BillingError)\(\s*'(\w+)'/g, /\bfail\(\s*'(\w+)'/g, /(?:throw|return) new BillingError\(\s*'(\w+)'/g])
    const missing = [...used].filter(([k]) => !(k in en) || !(k in hi)).map(([k, f]) => `${k} (${f.split('/src/')[1]})`)
    expect(missing).toEqual([])
  })

  // The server names the message to show (`key`); the frontend must know every one, or the person sees a raw server sentence.
  const server = join(__dirname, '../../../rapidbill-be/src')
  it.skipIf(!existsSync(server))('backend: every `key` the API can send is in the English and Hindi catalogue', () => {
    const files = walk(server).filter((f) => !f.includes('/src/config/')) // plan and feature names are not error messages
    const used = keysIn(files, [/\bkey:\s*'(\w+)'/g, /\bfail\(\s*'(\w+)'/g])
    // keys that exist only to be picked inside the service and are passed on as plain values
    const ignore = new Set(['key', 'string', 'text', 'number'])
    const missing = [...used].filter(([k]) => !ignore.has(k) && (!(k in en) || !(k in hi))).map(([k, f]) => `${k} (${f.split('/src/')[1]})`)
    expect(missing).toEqual([])
  })
})
