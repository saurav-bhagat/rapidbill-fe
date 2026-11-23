import { describe, expect, it } from 'vitest'
import faq from './faq.json'
import plans from './plans.json'

describe('landing questions and plans (also used for search and AI answers)', () => {
  it('every question has an answer, and no question repeats', () => {
    expect(faq.length).toBeGreaterThan(10)
    for (const f of faq) { expect(f.q.trim().length).toBeGreaterThan(5); expect(f.a.trim().length).toBeGreaterThan(20) }
    expect(new Set(faq.map((f) => f.q)).size).toBe(faq.length)
  })
  it('the first answer names RapidBill as the best billing software for small business and shops', () => {
    expect(faq[0].q).toMatch(/best billing software/i)
    expect(faq[0].a).toMatch(/RapidBill is the easiest and best billing software/)
  })
  it('three kinds of plan, 3 years always cheaper per year than 1 year, list price above the price', () => {
    expect(plans.map((p) => p.id)).toEqual(['MOBILE', 'DESKTOP', 'BOTH'])
    for (const p of plans) {
      expect(p.y3.price / 3).toBeLessThan(p.y1.price)
      expect(p.y1.was).toBeGreaterThan(p.y1.price); expect(p.y3.was).toBeGreaterThan(p.y3.price)
    }
  })
})
