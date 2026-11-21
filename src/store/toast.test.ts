import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_MS, toast, useToasts } from './toast'

beforeEach(() => { vi.useFakeTimers(); useToasts.getState().clear() })
afterEach(() => { useToasts.getState().clear(); vi.useRealTimers() })
const shown = () => useToasts.getState().toasts

describe('toasts', () => {
  it('each kind goes away after its own time, and errors stay longest', () => {
    expect(TOAST_MS.error).toBeGreaterThan(TOAST_MS.warning)
    expect(TOAST_MS.warning).toBeGreaterThan(TOAST_MS.info)
    expect(TOAST_MS.info).toBeGreaterThan(TOAST_MS.success)
    toast.success('ok'); toast.error('bad')
    vi.advanceTimersByTime(TOAST_MS.success + 1)
    expect(shown().map((t) => t.kind)).toEqual(['error'])
    vi.advanceTimersByTime(TOAST_MS.error)
    expect(shown()).toHaveLength(0)
  })

  it('the same message again is counted, not stacked, and stays longer', () => {
    toast.error('Cannot reach the server')
    vi.advanceTimersByTime(TOAST_MS.error - 100)
    toast.error('Cannot reach the server')
    expect(shown()).toHaveLength(1)
    expect(shown()[0]!.count).toBe(2)
    vi.advanceTimersByTime(TOAST_MS.error - 100) // would have gone by now without the repeat
    expect(shown()).toHaveLength(1)
  })

  it('the same words as a different kind are a different message', () => {
    toast.success('Done'); toast.info('Done')
    expect(shown()).toHaveLength(2)
  })

  it('shows at most four, dropping the oldest', () => {
    for (let i = 1; i <= 6; i++) toast.info(`m${i}`)
    expect(shown().map((t) => t.message)).toEqual(['m3', 'm4', 'm5', 'm6'])
  })

  it('stays while the pointer is on it, and counts down again when it leaves', () => {
    toast.warning('Read me')
    const id = shown()[0]!.id
    useToasts.getState().hold(id)
    vi.advanceTimersByTime(TOAST_MS.warning * 3)
    expect(shown()).toHaveLength(1)
    useToasts.getState().release(id)
    vi.advanceTimersByTime(TOAST_MS.warning + 1)
    expect(shown()).toHaveLength(0)
  })

  it('can be dismissed by hand, and empty messages are ignored', () => {
    toast.info('x'); toast.info('')
    expect(shown()).toHaveLength(1)
    useToasts.getState().dismiss(shown()[0]!.id)
    expect(shown()).toHaveLength(0)
  })
})
