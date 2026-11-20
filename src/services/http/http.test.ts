import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { BillingError } from '../voucher'
import { toAppError } from './client'

describe('toAppError', () => {
  it('uses the catalogue key and params the server sent', () => {
    const e = toAppError(409, { code: 'CONFLICT', message: 'x', key: 'partyNameTaken', params: { name: 'Acme' } })
    expect(e).toBeInstanceOf(AppError)
    expect(e.key).toBe('partyNameTaken')
    expect(e.message).toBe('A party named "Acme" already exists')
  })
  it('keeps stock shortages on a BillingError so the grid can focus the line', () => {
    const shortages = [{ itemId: 'i1', name: 'Pen', available: 1, requested: 5 }]
    const e = toAppError(409, { code: 'STOCK', message: 'x', key: 'stockShort', params: { name: 'Pen', available: 1, requested: 5 }, details: shortages })
    expect(e).toBeInstanceOf(BillingError)
    expect((e as BillingError).code).toBe('STOCK')
    expect((e as BillingError).shortages).toEqual(shortages)
  })
  it('shows the server message when it has no known key, and a generic one for 5xx', () => {
    expect(toAppError(400, { code: 'VALIDATION', message: 'name: Required' }).message).toBe('name: Required')
    expect(toAppError(500, { code: 'INTERNAL', message: 'boom' }).key).toBe('serverError')
    expect(toAppError(502, null).key).toBe('serverError')
  })
  it('never trusts an unknown key from the server', () => {
    expect(toAppError(400, { code: 'VALIDATION', message: 'nope', key: '__proto__' }).key).toBe('serverMessage')
  })
})

describe('api()', () => {
  const session = (n: number) => ({ user: { id: 'u', email: 'a@b.co', name: 'A' }, workspace: { id: 'w', name: 'W' }, accessToken: `at${n}`, accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), refreshToken: `rt${n}` })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  let calls: { url: string; auth: string | null }[]

  beforeEach(() => {
    vi.resetModules(); vi.stubEnv('VITE_API_URL', 'http://api.test'); calls = []
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('refreshes once (single flight) when the access token has expired, then retries', async () => {
    const { api, tokens } = await import('./client')
    tokens.set({ ...session(1), accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() })
    let refreshes = 0
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null })
      if (url.endsWith('/auth/refresh')) { refreshes++; return json(200, session(2)) }
      return json(200, { ok: true })
    }))
    await Promise.all([api('/items'), api('/parties')])
    expect(refreshes).toBe(1)
    expect(calls.filter((c) => !c.url.endsWith('/auth/refresh')).every((c) => c.auth === 'Bearer at2')).toBe(true)
    expect(localStorage.getItem('rapidbill:refresh-token')).toBe('rt2')
  })

  it('signs the user out when the refresh token is rejected', async () => {
    const { api, tokens } = await import('./client')
    tokens.set({ ...session(1), accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() })
    const lost = vi.fn()
    tokens.onLost(lost)
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => String(input).endsWith('/auth/refresh') ? json(401, { code: 'UNAUTHORIZED', message: 'x', key: 'sessionExpired' }) : json(401, { code: 'UNAUTHORIZED', message: 'x', key: 'authRequired' })))
    await expect(api('/items')).rejects.toMatchObject({ key: 'authRequired' })
    expect(lost).toHaveBeenCalled()
    expect(localStorage.getItem('rapidbill:refresh-token')).toBeNull()
  })

  it('reports a network failure as a translatable error', async () => {
    const { api } = await import('./client')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(api('/health', { auth: false })).rejects.toMatchObject({ key: 'networkError' })
  })

  it('reads every page of a list', async () => {
    const { apiAll } = await import('./client')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      return json(200, { data: page === 1 ? [1, 2] : [3], total: 3, page, limit: 2 })
    }))
    expect(await apiAll('/items', {}, 2)).toEqual([1, 2, 3])
  })
})
