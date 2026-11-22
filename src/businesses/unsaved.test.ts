import { describe, expect, it } from 'vitest'
import { hasUnsaved, useUnsaved } from './unsaved'

describe('unsaved work', () => {
  it('is on while any screen reports changes, and off when they are all saved or gone', () => {
    const s = useUnsaved.getState()
    expect(hasUnsaved()).toBe(false)
    s.set('bill', true); expect(hasUnsaved()).toBe(true)
    s.set('settings', true); s.set('bill', false); expect(hasUnsaved()).toBe(true) // settings still has changes
    s.set('settings', false); expect(hasUnsaved()).toBe(false)
  })
  it('reporting the same state twice changes nothing', () => {
    const s = useUnsaved.getState()
    s.set('bill', true); s.set('bill', true)
    expect(useUnsaved.getState().keys).toEqual(['bill'])
    s.set('bill', false)
  })
})
