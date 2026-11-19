import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAMESPACES } from './index'

const dir = (l: string) => join(__dirname, 'locales', l)
const read = (l: string, ns: string) => JSON.parse(readFileSync(join(dir(l), `${ns}.json`), 'utf8')) as Record<string, unknown>

function flat(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]))
}
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',')
function leaves(o: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)] as [string, string]]))
}

describe('translation catalogues', () => {
  it('has the same files in every language and none missing from NAMESPACES', () => {
    const en = readdirSync(dir('en')).map((f) => f.replace('.json', '')).sort()
    expect(readdirSync(dir('hi')).map((f) => f.replace('.json', '')).sort()).toEqual(en)
    expect(en).toEqual([...NAMESPACES].sort())
  })
  for (const ns of NAMESPACES) {
    it(`${ns}: Hindi has exactly the English keys and the same {{placeholders}}`, () => {
      const en = read('en', ns), hi = read('hi', ns)
      expect(flat(hi).sort()).toEqual(flat(en).sort())
      const hiMap = new Map(leaves(hi))
      for (const [k, v] of leaves(en)) expect({ k, p: placeholders(hiMap.get(k) ?? '') }).toEqual({ k, p: placeholders(v) })
    })
  }
})
