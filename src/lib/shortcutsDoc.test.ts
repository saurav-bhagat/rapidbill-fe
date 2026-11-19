import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderShortcutsMd } from './shortcutsDoc'
import { SHORTCUTS } from './shortcuts'

const FILE = new URL('../../SHORTCUTS.md', import.meta.url)

describe('SHORTCUTS.md', () => {
  it('matches the shortcut registry (run `npm run docs:shortcuts` after editing it)', () => {
    const md = renderShortcutsMd()
    if (process.env.UPDATE_DOCS) writeFileSync(FILE, md)
    expect(readFileSync(FILE, 'utf8')).toBe(md)
  })
  it('has no duplicate combo within a scope and group', () => {
    const seen = new Set<string>()
    for (const s of SHORTCUTS) {
      const k = `${s.scope}|${s.group}|${s.combo}`
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
    }
  })
})
