import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
;(globalThis as { document?: unknown }).document ??= { documentElement: {} }
import { initI18n } from '@/i18n'
import { AppError } from '@/services/errors'
import { useToasts } from '@/store/toast'
import { reportError, reportLoadError } from './notify'

beforeAll(async () => { await initI18n() })
beforeEach(() => useToasts.getState().clear())
const shown = () => useToasts.getState().toasts.map((t) => [t.kind, t.message])

describe('reportError', () => {
  it('shows a known problem in plain words', () => {
    reportError(new AppError('partyNameTaken', { name: 'Acme' }))
    expect(shown()).toEqual([['error', 'A party named "Acme" already exists']])
  })
  it('no connection is a warning, not an error', () => {
    reportError(new AppError('networkError'))
    expect(shown()[0]![0]).toBe('warning')
  })
  it('an unexpected failure gets a generic message, or the one the screen offered', () => {
    reportError(new Error('boom'))
    reportError(new Error('boom'), 'Could not do the thing')
    expect(shown().map((s) => s[1])).toEqual([expect.stringMatching(/went wrong|unexpected|try again/i), 'Could not do the thing'])
  })
  it('a request we cancelled ourselves says nothing', () => {
    reportError(new DOMException('aborted', 'AbortError'))
    expect(shown()).toEqual([])
  })
})

describe('reportLoadError', () => {
  it('several loads failing for the same reason produce one message', () => {
    const e = new AppError('serverError')
    reportLoadError(e); reportLoadError(e); reportLoadError(e)
    expect(shown()).toHaveLength(1)
  })
})
