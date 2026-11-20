import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import type { Item, Party, Voucher } from '@/services/types'

type Q = Record<string, string | number | undefined>
interface Feed { epoch: number; cursor: string; hasMore: boolean; items: Partial<Item>[]; parties: Partial<Party>[]; settings: unknown; vouchers: Partial<Voucher>[]; deleted: { parties: string[] } }

let respond: (q: Q) => Feed | Error
const calls: Q[] = []
vi.mock('@/auth/session', () => ({ useAuth: { getState: () => ({ user: { id: 'u1' }, workspace: { id: 'ws' } }) } }))
vi.mock('@/services/http/client', () => {
  const api = vi.fn(async (_path: string, o: { query?: Q }) => {
    calls.push(o.query ?? {})
    const r = respond(o.query ?? {})
    if (r instanceof Error) throw r
    return r
  })
  return { api, apiAll: (path: string, query: Q) => api(path, { query }) }
})

const feed = (over: Partial<Feed> = {}): Feed => ({ epoch: 0, cursor: 'c1', hasMore: false, items: [], parties: [], settings: null, vouchers: [], deleted: { parties: [] }, ...over })
const item = (id: string, name = id) => ({ id, name, code: id.toUpperCase(), currentStock: 5 })
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

let n = 0
async function fresh() {
  vi.resetModules()
  calls.length = 0
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const state = await import('./state')
  const mirror = await openMirror(`ws-${++n}`)
  sync.attachMirror(mirror)
  // The code under test is loaded fresh, so its error class is a different object from one imported at the top of this file.
  const { AppError: Fresh } = await import('@/services/errors')
  return { mirror, netErr: () => new Fresh('networkError'), ...sync, ...state }
}

describe('pull', () => {
  beforeEach(() => { respond = () => feed() })

  it('downloads every page, stores the rows and remembers where it got to', async () => {
    const { mirror, pull } = await fresh()
    respond = (q) => q.cursor === undefined
      ? feed({ cursor: 'p1', hasMore: true, items: [item('a'), item('b')], settings: { id: 's', companyName: 'Shop' } })
      : feed({ cursor: 'p2', items: [item('c')], parties: [{ id: 'p', name: 'Acme' }], vouchers: [{ id: 'v', number: 'SI-1', date: day(-1) }] })
    expect((await pull(mirror)).changed).toBe(true)
    expect((await mirror.all('items')).length).toBe(3)
    expect((await mirror.all('parties')).length).toBe(1)
    expect((await mirror.all('vouchers')).length).toBe(1)
    expect(((await mirror.all('settings'))[0] as { companyName: string }).companyName).toBe('Shop')
    expect(await mirror.getMeta('cursor')).toBe('p2')
    expect(calls[1]!.cursor).toBe('p1')
  })

  it('later rounds start from the saved cursor with the overlap flag, and apply deletions', async () => {
    const { mirror, pull } = await fresh()
    respond = () => feed({ cursor: 'c1', parties: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] })
    await pull(mirror)
    respond = () => feed({ cursor: 'c2', deleted: { parties: ['p1'] } })
    await pull(mirror)
    expect(calls[1]).toMatchObject({ cursor: 'c1', fresh: '1' })
    expect((await mirror.all<Party>('parties')).map((p) => p.id)).toEqual(['p2'])
  })

  it('reports no change when nothing came in', async () => {
    const { mirror, pull } = await fresh()
    await pull(mirror)
    expect((await pull(mirror)).changed).toBe(false)
  })

  it('starts over when the server says its data was reset (epoch changed)', async () => {
    const { mirror, pull } = await fresh()
    respond = () => feed({ epoch: 0, items: [item('old')] })
    await pull(mirror)
    respond = (q) => q.cursor === undefined ? feed({ epoch: 1, cursor: 'new', items: [item('fresh')] }) : feed({ epoch: 1, cursor: 'x' })
    await pull(mirror)
    expect((await mirror.all<Item>('items')).map((i) => i.id)).toEqual(['fresh'])
    expect(await mirror.getMeta('epoch')).toBe(1)
  })

  it('drops bills older than the 30 day window', async () => {
    const { mirror, pull } = await fresh()
    await mirror.putMany('vouchers', [{ id: 'old', date: day(-40), number: 'SI-1' }, { id: 'new', date: day(-2), number: 'SI-2' }])
    await pull(mirror)
    expect((await mirror.all<Voucher>('vouchers')).map((v) => v.id)).toEqual(['new'])
  })

  it('asks only for the last 30 days of bills', async () => {
    const { mirror, pull } = await fresh()
    await pull(mirror)
    expect(calls[0]!.voucherFrom).toBe(day(-30))
  })

  it('keeps what it already has when the connection drops mid-download, and resumes later', async () => {
    const { mirror, pull } = await fresh()
    respond = (q) => q.cursor === undefined ? feed({ cursor: 'p1', hasMore: true, items: [item('a')] }) : new AppError('networkError')
    await expect(pull(mirror)).rejects.toMatchObject({ key: 'networkError' })
    expect((await mirror.all('items')).length).toBe(1)
    expect(await mirror.getMeta('cursor')).toBe('p1')
    respond = (q) => (q.cursor === 'p1' ? feed({ cursor: 'p2', items: [item('b')] }) : feed())
    await pull(mirror)
    expect((await mirror.all('items')).length).toBe(2)
  })
})

describe('syncNow', () => {
  it('never throws; goes offline on a network error and back online when it works again', async () => {
    const { syncNow, useSync, netErr } = await fresh()
    respond = () => netErr()
    await expect(syncNow()).resolves.toBeUndefined()
    expect(useSync.getState().online).toBe(false)
    respond = () => feed({ items: [item('a')] })
    await syncNow()
    expect(useSync.getState().online).toBe(true)
    expect(useSync.getState().lastSyncAt).not.toBeNull()
    expect(useSync.getState().version).toBeGreaterThan(0) // screens are told to reload
  })

  it('a call made while a pull is running is not lost: it triggers one more pull afterwards', async () => {
    const { syncNow } = await fresh()
    let releaseFirst!: () => void
    const gate = new Promise<void>((r) => { releaseFirst = r })
    let n = 0
    const { api } = await import('@/services/http/client')
    vi.mocked(api).mockImplementation((async () => { n++; if (n === 1) await gate; return feed() }) as never)
    const a = syncNow()
    const b = syncNow()
    releaseFirst()
    await Promise.all([a, b])
    expect(n).toBe(2)
  })
})

describe('services on the device copy', () => {
  it('lists items and parties and finds bills with no connection at all', async () => {
    const { mirror, netErr } = await fresh()
    await mirror.putMany('items', [item('b', 'Bravo'), item('a', 'Alpha')])
    await mirror.putMany('parties', [{ id: 'p', name: 'Zed' }])
    await mirror.putMany('vouchers', [{ id: 'v1', number: 'SI-2026-0002', date: day(-1) }, { id: 'v2', number: 'SI-2026-0010', date: day(-1) }])
    const { api } = await import('@/services/http/client')
    vi.mocked(api).mockImplementation((async () => { throw netErr() }) as never)
    const { createMirrorServices } = await import('./mirrorServices')
    const s = createMirrorServices()
    expect((await s.items.list()).map((i) => i.name)).toEqual(['Alpha', 'Bravo'])
    expect((await s.items.get('a'))?.name).toBe('Alpha')
    expect((await s.parties.list()).map((p) => p.name)).toEqual(['Zed'])
    expect((await s.vouchers.list()).map((v) => v.number)).toEqual(['SI-2026-0010', 'SI-2026-0002']) // newest first, numbers in natural order
    expect((await s.vouchers.get('v1'))?.number).toBe('SI-2026-0002')
    expect(vi.mocked(api)).not.toHaveBeenCalledWith('/items', expect.anything())
  })

  it('a write that needs the internet fails with a clear error instead of pretending to save', async () => {
    const { netErr } = await fresh()
    const { api } = await import('@/services/http/client')
    vi.mocked(api).mockImplementation((async () => { throw netErr() }) as never)
    const { createMirrorServices } = await import('./mirrorServices')
    await expect(createMirrorServices().parties.create({ name: 'X', type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0 })).rejects.toMatchObject({ key: 'networkError' })
  })
})
