import { describe, expect, it } from 'vitest'
import { normalizeRef, refFromSearch } from './refLink'

describe('normalizeRef', () => {
  it('tidies what was typed, like the server', () => {
    expect(normalizeRef('rb-7k4m2q')).toBe('RB-7K4M2Q')
    expect(normalizeRef(' RB 7K4M2Q ')).toBe('RB-7K4M2Q')
    expect(normalizeRef('7k4m2q')).toBe('RB-7K4M2Q')
    expect(normalizeRef('RB7K4M2Q')).toBe('RB-7K4M2Q')
  })
  it('refuses what cannot be a code', () => {
    for (const bad of ['', 'RB-', 'RB-7K4M2', 'RB-7K4M2QQ', 'RB-0K4M2Q', 'RB-7K4M2O', 'RB-7K4M2L', '<script>', 'x'.repeat(40)]) expect(normalizeRef(bad)).toBeNull()
  })
})

describe('refFromSearch', () => {
  it('reads the code from a link', () => {
    expect(refFromSearch('?ref=RB-7K4M2Q')).toBe('RB-7K4M2Q')
    expect(refFromSearch('?utm=x&ref=rb7k4m2q')).toBe('RB-7K4M2Q')
  })
  it('ignores a missing or bad one', () => {
    expect(refFromSearch('')).toBeNull()
    expect(refFromSearch('?ref=')).toBeNull()
    expect(refFromSearch('?ref=hello')).toBeNull()
  })
})
