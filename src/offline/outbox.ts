import { newId } from '@/lib/id'
import { AppError, type ErrorKey, type ErrorParams } from '@/services/errors'
import { api } from '@/services/http/client'
import { createBillingService, type BillingOwner, type VoucherInput } from '@/services/voucher'
import type { StorageAdapter } from '@/services/storage/localStorageAdapter'
import type { Item, Meta, Party, Voucher } from '@/services/types'
import { formatVoucherNo } from '@/lib/voucherNo'
import type { Mirror } from './db'
import { noticeRefused } from './notices'
import type { AsBusiness } from '@/services/http/client'
import { useDevices } from './devices'
import { notifyOthers, setSync, useSync } from './state'

type VoucherPayload = VoucherInput & { id: string; clientCreatedAt: string }
/** What the server is sent when an item or party made here is created there. The id is chosen on this device. */
export type ItemPayload = Omit<Item, keyof Meta> & { id: string }
export type PartyPayload = Omit<Party, keyof Meta> & { id: string }

interface EntryBase {
  id: string
  /** Order things were made in; they are sent in this order (so an item reaches the server before a bill that uses it). */
  seq: number
  status: 'pending' | 'failed'
  /** For the "needs attention" list: bill number, item code, or party name. */
  number: string
  /** Party name for a bill, item name for an item. */
  partyName: string
  total: number
  error?: { key: ErrorKey; params: ErrorParams }
  attempts: number
  createdAt: string
}
/** A bill made on this device, waiting to be confirmed by the server. */
export interface VoucherEntry extends EntryBase {
  kind?: 'voucher'
  payload: VoucherPayload
  /** Cancelled before it reached the server: it is sent, then cancelled there, so the number stays on record as a cancelled bill. */
  cancel?: boolean
}
export interface ItemEntry extends EntryBase { kind: 'item'; payload: ItemPayload }
export interface PartyEntry extends EntryBase { kind: 'party'; payload: PartyPayload }
export type OutboxEntry = VoucherEntry | ItemEntry | PartyEntry
export const isVoucherEntry = (e: OutboxEntry): e is VoucherEntry => !e.kind || e.kind === 'voucher'

export const listOutbox = async (m: Mirror) => (await m.all<OutboxEntry>('outbox')).sort((a, b) => a.seq - b.seq)

export async function refreshOutboxState(m: Mirror, tellOtherTabs = true) {
  const all = await listOutbox(m)
  const waiting = all.filter((e) => e.status === 'pending')
  const failedNow = all.filter((e) => e.status === 'failed')
  // what this device holds for this business, for the switcher and the sign-out warning
  useDevices.getState().put(m.id, { pending: waiting.length, failed: failedNow.length })
  // The counters on screen are about the business that is open; a copy opened only to send its bills in the background must not change them.
  if (!m.background) {
    const grew = failedNow.filter((e) => !useSync.getState().failedIds.includes(e.id)).length
    if (tellOtherTabs) noticeRefused(grew) // something the server turned down: tell the person once
    setSync({
      pendingIds: waiting.map((e) => e.id), failedIds: all.filter((e) => e.status === 'failed').map((e) => e.id),
      oldestWaiting: waiting.reduce<string | null>((o, e) => (o === null || e.createdAt < o ? e.createdAt : o), null),
    })
    if (tellOtherTabs) notifyOthers('outbox')
  }
  return all
}

const chains = new Map<string, Promise<unknown>>()

/**
 * Run `fn` alone: across every open tab where the browser supports Web Locks, and at least within this tab everywhere else.
 * So two tabs never take the same bill number, and a bill is never changed while it is being sent.
 */
export async function exclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks
  if (locks) return locks.request(name, fn)
  const run = (chains.get(name) ?? Promise.resolve()).then(fn, fn)
  chains.set(name, run.catch(() => undefined))
  return run
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
    const entry: VoucherEntry = {
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

export const FLUSH_LOCK = 'rapidbill-outbox-flush'
/** One send lock per business: the open business and the background sender never send the same business's queue at once, but different businesses do not wait for each other. */
export const flushLock = (m: Mirror) => `${FLUSH_LOCK}:${m.id}`

/** Is what the server holds for this bill different from what this device wants it to be? */
function differs(saved: Voucher | undefined, want: VoucherPayload): boolean {
  if (!saved || !Array.isArray(saved.lines)) return false // a reply we cannot read: assume it is the same
  const lines = (ls: { itemId: string; qty: number; rate: number; discPct: number; unit?: string }[]) => JSON.stringify(ls.map((l) => [l.itemId, l.qty, l.rate, l.discPct, l.unit ?? '']))
  // a saved line is in an alternate unit only when it converts (per is not 1); in its own unit the payload leaves `unit` out
  const savedLines = saved.lines.map((l) => ({ ...l, unit: (l.per ?? 1) !== 1 ? l.unit : undefined }))
  return lines(savedLines) !== lines(want.lines)
    || saved.partyId !== want.partyId || saved.payment !== want.payment || saved.date !== want.date
    || (saved.remarks ?? '') !== (want.remarks ?? '') || JSON.stringify(saved.billDiscount ?? null) !== JSON.stringify(want.billDiscount ?? null)
}

/** The fields an item or party can be edited in (stock is never edited this way). */
const ITEM_FIELDS = ['name', 'code', 'category', 'hsn', 'unit', 'batchNo', 'expiry', 'mrp', 'purchaseRate', 'issueRate', 'gstPercent', 'lowStockThreshold'] as const
// The balance is not here on purpose: once credit bills have reached the server it is theirs to change, and an old opening balance must never overwrite it.
const PARTY_FIELDS = ['name', 'type', 'gstin', 'stateCode', 'address', 'phone'] as const
const pickFields = (o: object, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]))
const sameFields = (a: object, b: object, keys: readonly string[]) => keys.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k])

/** Send one waiting entry. Throws on any failure; the caller decides if it is temporary or a refusal. */
async function send(e: OutboxEntry, as?: AsBusiness): Promise<void> {
  if (e.kind === 'item') {
    const saved = await api<Item>('/items', { method: 'POST', body: e.payload, timeoutMs: 20_000, as })
    // The server may already have an older copy (an earlier send whose reply was lost, before it was edited here): send the newer fields as an edit.
    if (saved && typeof saved.code === 'string' && !sameFields(saved, e.payload, ITEM_FIELDS)) await api<Item>(`/items/${e.id}`, { method: 'PATCH', body: pickFields(e.payload, ITEM_FIELDS), timeoutMs: 20_000, as })
    return
  }
  if (e.kind === 'party') {
    const saved = await api<Party>('/parties', { method: 'POST', body: e.payload, timeoutMs: 20_000, as })
    if (saved && typeof saved.name === 'string' && !sameFields(saved, e.payload, PARTY_FIELDS)) await api<Party>(`/parties/${e.id}`, { method: 'PATCH', body: pickFields(e.payload, PARTY_FIELDS), timeoutMs: 20_000, as })
    return
  }
  const saved = await api<Voucher>('/vouchers', { method: 'POST', body: e.payload, timeoutMs: 20_000, as })
  // Same idea for a bill: an older copy is replaced by sending the newer one as an edit.
  if (differs(saved, e.payload)) await api<Voucher>(`/vouchers/${e.id}`, { method: 'PUT', body: e.payload, timeoutMs: 20_000, as })
  if (e.cancel) {
    try { await api<Voucher>(`/vouchers/${e.id}/cancel`, { method: 'POST', timeoutMs: 20_000, as }) } catch (err) {
      if (!(err instanceof AppError && err.key === 'alreadyCancelled')) throw err // already cancelled counts as done
    }
  }
}

/**
 * Send waiting entries, oldest first. Stops at the first sign the server is unreachable. One the server refuses is parked for a person.
 * The send lock is taken one entry at a time, so changing a waiting bill never has to wait for the whole queue.
 */
export async function flushOutbox(m: Mirror, as?: AsBusiness): Promise<{ sent: number; unreachable: boolean; why?: ErrorKey }> {
  let sent = 0
  let unreachable = false
  let why: ErrorKey | undefined
  for (;;) {
    // Always the oldest waiting entry as it stands now: an edit may have moved one to the back of the queue since we last looked.
    const next = (await listOutbox(m)).find((x) => x.status === 'pending')
    if (!next) break
    const outcome = await exclusive(flushLock(m), async (): Promise<'done' | 'stop' | 'again'> => {
      const all = await listOutbox(m)
      const e = all.find((x) => x.status === 'pending')
      if (!e || e.id !== next.id) return 'again' // changed while we waited for the lock
      try {
        await send(e, as)
        await m.batch([{ store: 'outbox', remove: [e.id] }])
        sent++
        return 'done'
      } catch (err) {
        if (!(err instanceof AppError) || TEMPORARY.includes(err.key)) { unreachable = true; why = err instanceof AppError ? err.key : 'networkError'; return 'stop' }
        await m.batch([{ store: 'outbox', put: [{ ...e, status: 'failed', attempts: e.attempts + 1, error: { key: err.key, params: err.params } }] }])
        return 'done'
      }
    })
    if (outcome === 'stop') break
  }
  await refreshOutboxState(m)
  return { sent, unreachable, why }
}

/**
 * Change a bill that has not reached the server yet. Its stock and credit effects are redone on the device and the queued copy is
 * replaced, so the server only ever sees the final version. Returns undefined when the bill is not waiting (it is already on the server).
 */
export function editWaiting(m: Mirror, owner: BillingOwner, id: string, input: VoucherInput): Promise<Voucher | undefined> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (!e || !isVoucherEntry(e)) return undefined
    if (e.cancel) throw new AppError('cancelledNoEdit')
    const { adapter, changes } = bufferedAdapter(m, await stubs(m))
    const voucher = await createBillingService(adapter, owner).update(id, { ...input, id })
    // If the edit adds an item or party that was made after this bill was queued, the bill must be sent after it.
    const all = await listOutbox(m)
    const uses = new Set([...input.lines.map((l) => l.itemId), input.partyId].filter((x): x is string => !!x))
    const needsLater = all.some((x) => (x.kind === 'item' || x.kind === 'party') && uses.has(x.id) && x.seq > e.seq)
    const entry: VoucherEntry = {
      ...e, status: 'pending', error: undefined, number: voucher.number, partyName: voucher.partyName, total: voucher.totals.grandTotal,
      seq: needsLater ? (all.at(-1)?.seq ?? e.seq) + 1 : e.seq,
      payload: { ...input, id, number: voucher.number, clientCreatedAt: e.payload.clientCreatedAt },
    }
    await m.batch([
      { store: 'items', put: changes<Item>('items') },
      { store: 'parties', put: changes<Party>('parties') },
      { store: 'vouchers', put: [voucher] },
      { store: 'outbox', put: [entry] },
    ])
    await refreshOutboxState(m)
    return voucher
  }))
}

/** Cancel a bill that has not reached the server yet: stock and credit come back here, and the bill is sent and then cancelled there. */
export function cancelWaiting(m: Mirror, owner: BillingOwner, id: string): Promise<Voucher | undefined> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (!e || !isVoucherEntry(e)) return undefined
    if (e.status === 'failed') throw new AppError('billNeedsAttention')
    const { adapter, changes } = bufferedAdapter(m, [])
    const voucher = await createBillingService(adapter, owner).cancel(id)
    await m.batch([
      { store: 'items', put: changes<Item>('items') },
      { store: 'parties', put: changes<Party>('parties') },
      { store: 'vouchers', put: [voucher] },
      { store: 'outbox', put: [{ ...e, cancel: true }] },
    ])
    await refreshOutboxState(m)
    return voucher
  }))
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
  if (!e || !isVoucherEntry(e) || !v) return
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
