import { describe, expect, it } from 'vitest'
import { hasNewReward } from './store'

describe('the new-reward dot', () => {
  it('shows only when more was earned than the person has seen', () => {
    expect(hasNewReward(null, 0)).toBe(false)
    expect(hasNewReward(0, 0)).toBe(false)
    expect(hasNewReward(13550, 0)).toBe(true)
    expect(hasNewReward(13550, 13550)).toBe(false)
    expect(hasNewReward(5000, 13550)).toBe(false) // a reward taken back is not news
    expect(hasNewReward(20000, 13550)).toBe(true)
  })
})
