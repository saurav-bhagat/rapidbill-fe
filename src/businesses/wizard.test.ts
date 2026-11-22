import { describe, expect, it } from 'vitest'
import { cardsFor, threeYearSavingPercent } from '@/license/pricing'
import type { PlanView } from '@/license/checkout'
import { buildCreateBody, type WizardAnswers } from './store'

const base: WizardAnswers = { name: '  Bharat Electricals ', businessType: '', stateCode: '', gstin: '', address: '', start: 'EMPTY', copySettings: false, sourceId: 'src-1' }

describe('add business: what is sent', () => {
  it('a name alone is enough: every other step can be skipped', () => {
    expect(buildCreateBody('id-1', base)).toEqual({ id: 'id-1', name: 'Bharat Electricals' })
  })
  it('sends the place and type when given, with the GSTIN in capitals', () => {
    expect(buildCreateBody('i', { ...base, businessType: 'electrical', stateCode: '27', gstin: ' 27aakfs4821m1zk ', address: ' Pune ' })).toEqual({ id: 'i', name: 'Bharat Electricals', businessType: 'electrical', stateCode: '27', gstin: '27AAKFS4821M1ZK', address: 'Pune' })
  })
  it('copy items, copy items and parties, and settings only', () => {
    expect(buildCreateBody('i', { ...base, start: 'ITEMS' }).copyFrom).toEqual({ businessId: 'src-1', items: true, parties: false, settings: false })
    expect(buildCreateBody('i', { ...base, start: 'ITEMS_PARTIES', copySettings: true }).copyFrom).toEqual({ businessId: 'src-1', items: true, parties: true, settings: true })
    expect(buildCreateBody('i', { ...base, copySettings: true }).copyFrom).toEqual({ businessId: 'src-1', items: false, parties: false, settings: true })
  })
  it('starting empty never sends a copy, even if a source is chosen', () => {
    expect(buildCreateBody('i', base)).not.toHaveProperty('copyFrom')
  })
})

const plan = (platform: PlanView['platform'], years: number, price: number, savesVsYearly = 0): PlanView =>
  ({ id: `${platform}_Y${years}`, platform, years, price, listPrice: null, discountPercent: 0, perYear: 0, perMonth: 0, savesVsYearly, highlight: platform === 'BOTH' ? 'BEST_VALUE' : null })
const all = [plan('BOTH', 3, 339_900, 138_800), plan('MOBILE', 1, 79_900), plan('DESKTOP', 3, 229_900, 69_800), plan('BOTH', 1, 159_900), plan('MOBILE', 3, 179_900, 60_000), plan('DESKTOP', 1, 99_900)]

describe('the pricing page cards', () => {
  it('are three, in a fixed order with the full plan last, for each length', () => {
    expect(cardsFor(all, 1).map((p) => p.id)).toEqual(['MOBILE_Y1', 'DESKTOP_Y1', 'BOTH_Y1'])
    expect(cardsFor(all, 3).map((p) => p.id)).toEqual(['MOBILE_Y3', 'DESKTOP_Y3', 'BOTH_Y3'])
  })
  it('show exactly the prices from the plan (₹799 / ₹999 / ₹1,599 and ₹1,799 / ₹2,299 / ₹3,399)', () => {
    expect(cardsFor(all, 1).map((p) => p.price / 100)).toEqual([799, 999, 1599])
    expect(cardsFor(all, 3).map((p) => p.price / 100)).toEqual([1799, 2299, 3399])
  })
  it('the highlighted card is the full plan', () => {
    expect(cardsFor(all, 1).filter((p) => p.highlight === 'BEST_VALUE').map((p) => p.platform)).toEqual(['BOTH'])
  })
  it('the 3-year saving shown is the share of three yearly payments saved (29% for the full plan)', () => {
    expect(threeYearSavingPercent(all, 'BOTH')).toBe(29)
  })
})
