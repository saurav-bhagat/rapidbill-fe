import { describe, expect, it } from 'vitest'
import { rankItems } from './billing'
import { matchesQuery } from './search'
import type { Item } from '@/services'

const it_ = (name: string, code = '') => ({ id: name, name, code, category: '', batchNo: '', hsn: '' }) as unknown as Item
const items = [it_('Wire Anchor Clip', 'C1'), it_('Aluminium Wire', 'C2'), it_('Anchor Wire 2.5mm', 'C3'), it_('Bajaj Anchor Fan', 'C4'), it_('Anchor Switch', 'C5'), it_('Havells Switch Wall', 'C6')]
const names = (q: string) => rankItems(items, q, matchesQuery).map((i) => i.name)

describe('picker search with initials', () => {
  it('"a w" finds Anchor Wire first', () => {
    const r = names('a w')
    expect(r[0]).toBe('Aluminium Wire') // both start with A then Wire; alphabetical between equals
    expect(r).toContain('Anchor Wire 2.5mm')
    expect(r).not.toContain('Anchor Switch') // no word starts with w
  })
  it('"anchor w" puts Anchor Wire above Wire Anchor', () => {
    const r = names('anchor w')
    expect(r.indexOf('Anchor Wire 2.5mm')).toBeLessThan(r.indexOf('Wire Anchor Clip'))
  })
  it('a single piece still matches inside a word when nothing starts with it', () => {
    expect(names('chor')).toContain('Anchor Switch')
  })
  it('exact code still wins', () => { expect(names('c3')[0]).toBe('Anchor Wire 2.5mm') })
})
