import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/business.json'
import hi from '@/i18n/locales/hi/business.json'
import { BUSINESS_COLOR, colorOf, initials, sortBusinesses, type BusinessRow } from './store'

const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]))
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]! }

describe('business avatar', () => {
  it('uses up to two initials, whatever the spacing or case', () => {
    expect(initials('Shree Furniture Mart')).toBe('SF')
    expect(initials('  bharat   electricals ')).toBe('BE')
    expect(initials('Annapurna')).toBe('A')
    expect(initials('')).toBe('?')
  })
  it('every colour the server can assign has a real colour, readable with white text (contrast 4.5 or more)', () => {
    for (const k of ['amber', 'blue', 'green', 'red', 'purple', 'teal', 'coral', 'pink']) {
      const hex = BUSINESS_COLOR[k]!
      expect(hex, k).toMatch(/^#[0-9A-F]{6}$/)
      expect(1.05 / (lum(hex) + 0.05), k).toBeGreaterThanOrEqual(4.5)
    }
    expect(colorOf(null)).toMatch(/^#/) // a business with no colour still gets one
  })
})

describe('switcher texts', () => {
  it('Hindi has every English key', () => { expect(keys(hi).sort()).toEqual(keys(en).sort()) })
})

describe('order of businesses', () => {
  const b = (name: string, role: BusinessRow['role'], createdAt: string, current = false): BusinessRow => ({ id: name, name, role, color: null, stateCode: '', createdAt, current })
  it('is the same whichever business was opened last: owned first, then oldest first', () => {
    const a = [b('Joined', 'STAFF', '2026-01-01'), b('Second', 'OWNER', '2026-03-01', true), b('First', 'OWNER', '2026-02-01')]
    expect(sortBusinesses(a).map((x) => x.name)).toEqual(['First', 'Second', 'Joined'])
    expect(sortBusinesses([...a].reverse()).map((x) => x.name)).toEqual(['First', 'Second', 'Joined'])
  })
})
