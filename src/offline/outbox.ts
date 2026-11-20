import { newId } from '@/lib/id'
import { AppError, type ErrorKey, type ErrorParams } from '@/services/errors'
import { api } from '@/services/http/client'
import { createBillingService, type BillingOwner, type VoucherInput } from '@/services/voucher'
import type { StorageAdapter } from '@/services/storage/localStorageAdapter'
import type { Item, Party, Voucher } from '@/services/types'
import { formatVoucherNo } from '@/lib/voucherNo'
import type { Mirror } from './db'
import { setSync } from './state'

/** A bill made on this device, waiting to be confirmed by the server. */
export interface OutboxEntry {
  id: string
  /** Order the bills were made in; they are sent in this order. */
  seq: number
  status: 'pending' | 'failed'
  payload: VoucherInput & { id: string; clientCreatedAt: string }
  /** For the "needs attention" list. */
  number: string
  partyName: string
  total: number
  error?: { key: ErrorKey; params: ErrorParams }
  attempts: number
  createdAt: string
}

export const listOutbox = async (m: Mirror) => (await m.all<OutboxEntry>('outbox')).sort((a, b) => a.seq - b.seq)

export async function refreshOutboxState(m: Mirror) {
  const all = await listOutbox(m)
  setSync({ pendingIds: all.filter((e) => e.status === 'pending').map((e) => e.id), failedIds: all.filter((e) => e.status === 'failed').map((e) => e.id) })
  return all
}

/** Run `fn` alone, even across several open tabs of the app, so two tabs never take the same bill number. */
export async function exclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks) return fn()
  return locks.request(name, fn)
}

const SERIES_PREFIX = '__series__:'

/**
 * The local billing engine needs to see "every bill" to pick the next number, but the device only keeps 30 days. The highest number
 * the server told us about in each series is added as a stand-in, so numbering carries on from the right place after a quiet month.
 */
async function stubs(m: Mirror): Promise<Voucher[]> {
  const top = (await m.getMeta<Record<string, number>>('numbering')) ?? {}
  return Object.entries(top).map(([series, seq]) => {
    const i = series.lastIndexOf('-') // "SI-2026" -> prefix "SI", year 2026
    return { id: SERIES_PREFIX + series, number: formatVoucherNo(series.slice(0, i), Number(series.slice(i + 1)), seq) } as unknown as Voucher
  })
}

/** Lets the ordinary billing engine run on the device copy; its writes are held back so they can be saved together with the queue entry. */
function bufferedAdapter(m: Mirror, extra: Voucher[]) {
  const pending = new Map<string, unknown[]>()
  const before = new Map<string, unknown[]>()
  const adapter: StorageAdapter = {
    async read<T>(collection: string) {
      let rows: unknown[]
      if (collection === 'ledger') rows = [] // stock history lives on the server
      else if (collection === 'vouchers') rows = [...(await m.all<Voucher>('vouchers')), ...extra]
      else rows = await m.all(collection as 'items' | 'parties' | 'settings')
      if (!before.has(collection)) before.set(collection, JSON.parse(JSON.stringify(rows)))
      return rows as T[]
    },
    async write<T>(collection: string, rows: T[]) { pending.set(collection, rows as unknown[]) },
    async clearWorkspace() { /* not used */ },
    async isEmpty() { return false },
  }
  /** Only the rows the engine really changed. */
  const changes = <T extends { id: string }>(collection: string): T[] => {
    const now = (pending.get(collection) ?? []) as T[]
    const was = new Map(((before.get(collection) ?? []) as T[]).map((r) => [r.id, JSON.stringify(r)]))
    return now.filter((r) => !r.id.startsWith(SERIES_PREFIX) && was.get(r.id) !== JSON.stringify(r))
  }
  return { adapter, changes }
}

/** The next bill number as this device would give it (used while offline or while bills are waiting to be sent). */
export async function localNextNumber(m: Mirror, owner: BillingOwner, dateISO: string): Promise<string> {
  const { adapter } = bufferedAdapter(m, await stubs(m))
  return createBillingService(adapter, owner).nextNumber(dateISO)
}

/**
 * Make a bill entirely on this device: stock, party credit, the bill itself and its place in the send queue are saved
 * in one transaction, so a crash or closed tab can never leave a bill without its queue entry (or the reverse).
 */
export function saveLocally(m: Mirror, owner: BillingOwner, input: VoucherInput & { id: string; clientCreatedAt: string }): Promise<Voucher> {
  return exclusive('rapidbill-local-write', async () => {
    const { adapter, changes } = bufferedAdapter(m, await stubs(m))
    const voucher = await createBillingService(adapter, owner).save(input)
    const last = (await listOutbox(m)).at(-1)?.seq ?? 0
    const entry: OutboxEntry = {
      id: voucher.id, seq: last + 1, status: 'pending', number: voucher.number, partyName: voucher.partyName, total: voucher.totals.grandTotal,
      // Send the number this device already printed on the bill.
      payload: { ...input, number: voucher.number }, attempts: 0, createdAt: new Date().toISOString(),
    }
    await m.batch([
      { store: 'items', put: changes<Item>('items') },
      { store: 'parties', put: changes<Party>('parties') },
      { store: 'vouchers', put: [voucher] },
      { store: 'outbox', put: [entry] },
    ])
    await refreshOutboxState(m)
    return voucher
  })
}

/** Errors that mean "try again later", not "the server refused this bill". */
const TEMPORARY: ErrorKey[] = ['networkError', 'serverError', 'rateLimited', 'sessionExpired', 'authRequired']

/** Send waiting bills, oldest first. Stops at the first sign the server is unreachable. A bill the server refuses is parked for a person. */
export function flushOutbox(m: Mirror): Promise<{ sent: number; unreachable: boolean }> {
  return exclusive('rapidbill-outbox-flush', async () => {
    let sent = 0
    let unreachable = false
    for (const e of (await listOutbox(m)).filter((x) => x.status === 'pending')) {
      try {
        await api<Voucher>('/vouchers', { method: 'POST', body: e.payload, timeoutMs: 20_000 })
        await m.batch([{ store: 'outbox', remove: [e.id] }])
        sent++
      } catch (err) {
        if (!(err instanceof AppError) || TEMPORARY.includes(err.key)) { unreachable = true; break }
        await m.batch([{ store: 'outbox', put: [{ ...e, status: 'failed', attempts: e.attempts + 1, error: { key: err.key, params: err.params } }] }])
      }
    }
    await refreshOutboxState(m)
    return { sent, unreachable }
  })
}

export async function retryEntry(m: Mirror, id: string) {
  const e = (await m.get<OutboxEntry>('outbox', id))
  if (e) await m.batch([{ store: 'outbox', put: [{ ...e, status: 'pending', error: undefined }] }])
  await refreshOutboxState(m)
}

/**
 * Give a refused bill a new number and send it again. The paper copy already handed out carries the old number,
 * so the person has to reprint it; this only fixes the record.
 */
export async function renumberEntry(m: Mirror, owner: BillingOwner, id: string) {
  const e = await m.get<OutboxEntry>('outbox', id)
  const v = await m.get<Voucher>('vouchers', id)
  if (!e || !v) return
  const number = await localNextNumber(m, owner, e.payload.date)
  await m.batch([
    { store: 'outbox', put: [{ ...e, number, status: 'pending', error: undefined, payload: { ...e.payload, number } }] },
    { store: 'vouchers', put: [{ ...v, number }] },
  ])
  await refreshOutboxState(m)
}

/** Drop a bill the server refused. The stock and credit it took on this device are given back, since the server never counted it. */
export function discardEntry(m: Mirror, owner: BillingOwner, id: string) {
  return exclusive('rapidbill-local-write', async () => {
    const { adapter, changes } = bufferedAdapter(m, [])
    if (await m.get<Voucher>('vouchers', id)) await createBillingService(adapter, owner).cancel(id)
    await m.batch([
      { store: 'items', put: changes<Item>('items') },
      { store: 'parties', put: changes<Party>('parties') },
      { store: 'vouchers', remove: [id] },
      { store: 'outbox', remove: [id] },
    ])
    await refreshOutboxState(m)
  })
}

export const newBillId = newId
