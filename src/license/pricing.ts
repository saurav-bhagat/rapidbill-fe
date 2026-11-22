import type { PlanView } from './checkout'

/** The order of the three cards: the cheapest first, the full plan last (it is the highlighted one). */
export const PLATFORM_ORDER = ['MOBILE', 'DESKTOP', 'BOTH'] as const

/** One card per kind of plan for the chosen length, always in the same order. */
export function cardsFor(plans: PlanView[], years: number): PlanView[] {
  return PLATFORM_ORDER.map((p) => plans.find((x) => x.platform === p && x.years === years)).filter((x): x is PlanView => !!x)
}

/** Percent saved by taking the 3-year plan instead of three 1-year plans, for one kind of plan. */
export function threeYearSavingPercent(plans: PlanView[], platform: PlanView['platform']): number {
  const p = plans.find((x) => x.platform === platform && x.years === 3)
  return p && p.savesVsYearly > 0 ? Math.round((p.savesVsYearly / (p.price + p.savesVsYearly)) * 100) : 0
}
