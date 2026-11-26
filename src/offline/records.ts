import { newId } from '@/lib/id'
import { roundQty } from '@/lib/qty'
import { AppError } from '@/services/errors'
import { api } from '@/services/http/client'
import type { BillingOwner } from '@/services/voucher'
import type { Item, Meta, Party, Voucher } from '@/services/types'
import type { Mirror } from './db'
import { exclusive, flushLock, isReceiptEntry, isVoucherEntry, listOutbox, refreshOutboxState, type ItemEntry, type OutboxEntry, type PartyEntry, type VoucherEntry } from './outbox'

/**
 * Items and parties made on this device while there is no connection. Like a bill, each is saved in the device copy and queued in one
 * transaction, with an id chosen here; the queue sends them before any bill that uses them.
 */
type ItemData = Omit<Item, keyof Meta>
type PartyData = Omit<Party, keyof Meta>

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const lastSeq = async (m: Mirror) => (await listOutbox(m)).at(-1)?.seq ?? 0
const meta = (owner: BillingOwner, now: string) => ({ workspaceId: owner.workspaceId, createdBy: owner.userId, createdAt: now, updatedAt: now })

export function createItemLocally(m: Mirror, owner: BillingOwner, data: ItemData, id = newId()): Promise<Item> {
  return exclusive('rapidbill-local-write', async () => {
    const code = data.code.trim().toUpperCase()
    const clash = (await m.all<Item>('items')).find((i) => same(i.code, code))
    if (clash) throw new AppError('itemCodeUsedBy', { code, name: clash.name })
    const now = new Date().toISOString()
    const fields: ItemData = { ...data, code, currentStock: roundQty(data.currentStock) }
    const item: Item = { ...fields, id, ...meta(owner, now) }
    const entry: ItemEntry = { kind: 'item', id, seq: (await lastSeq(m)) + 1, status: 'pending', number: code, partyName: fields.name, total: 0, payload: { ...fields, id }, attempts: 0, createdAt: now }
    await m.batch([{ store: 'items', put: [item] }, { store: 'outbox', put: [entry] }])
    await refreshOutboxState(m)
    return item
  })
}

export function createPartyLocally(m: Mirror, owner: BillingOwner, data: PartyData, id = newId()): Promise<Party> {
  return exclusive('rapidbill-local-write', async () => {
    const name = data.name.trim()
    if ((await m.all<Party>('parties')).some((p) => same(p.name, name))) throw new AppError('partyNameTaken', { name })
    const now = new Date().toISOString()
    const fields: PartyData = { ...data, name }
    const party: Party = { ...fields, id, ...meta(owner, now) }
    const entry: PartyEntry = { kind: 'party', id, seq: (await lastSeq(m)) + 1, status: 'pending', number: name, partyName: '', total: 0, payload: { ...fields, id }, attempts: 0, createdAt: now }
    await m.batch([{ store: 'parties', put: [party] }, { store: 'outbox', put: [entry] }])
    await refreshOutboxState(m)
    return party
  })
}

/** Bills waiting in the queue that use this item or party. */
const billsUsing = (entries: OutboxEntry[], kind: 'item' | 'party', id: string): VoucherEntry[] =>
  entries.filter(isVoucherEntry).filter((e) => (kind === 'item' ? e.payload.lines.some((l) => l.itemId === id) : e.payload.partyId === id))

/**
 * Change an item or party that has not reached the server yet (the queued copy is replaced, so the server only sees the final one).
 * Returns undefined when it is not waiting: it is already on the server and must be changed there. Stock is never changed here.
 */
export function editWaitingRecord(m: Mirror, kind: 'item', id: string, patch: Partial<ItemData>): Promise<Item | undefined>
export function editWaitingRecord(m: Mirror, kind: 'party', id: string, patch: Partial<PartyData>): Promise<Party | undefined>
export function editWaitingRecord(m: Mirror, kind: 'item' | 'party', id: string, patch: Partial<ItemData> | Partial<PartyData>): Promise<Item | Party | undefined> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (!e || e.kind !== kind) return undefined
    const now = new Date().toISOString()
    if (e.kind === 'item') {
      const { currentStock: _s, ...rest } = patch as Partial<ItemData>
      void _s
      const changes = { ...rest, ...(rest.code !== undefined && { code: rest.code.trim().toUpperCase() }) }
      const next = { ...e.payload, ...changes }
      const clash = (await m.all<Item>('items')).find((i) => i.id !== id && same(i.code, next.code))
      if (clash) throw new AppError('itemCodeUsedBy', { code: next.code, name: clash.name })
      // The row keeps its own stock: bills made since have already taken from it. The queued copy keeps the opening stock it will be created with.
      const row = { ...(await m.get<Item>('items', id))!, ...changes, updatedAt: now }
      await m.batch([{ store: 'items', put: [row] }, { store: 'outbox', put: [{ ...e, status: 'pending', error: undefined, number: next.code, partyName: next.name, payload: next } satisfies ItemEntry] }])
      await refreshOutboxState(m)
      return row
    }
    const { balance: wanted, ...changes } = patch as Partial<PartyData>
    const current = (await m.get<Party>('parties', id))!
    // The balance shown includes credit from bills still waiting. Only a real change to it is carried over, as a difference,
    // so the opening balance sent to the server never counts those bills twice.
    const delta = wanted === undefined ? 0 : wanted - current.balance
    const next = { ...(e as PartyEntry).payload, ...changes, balance: (e as PartyEntry).payload.balance + delta, id }
    next.name = next.name.trim()
    if ((await m.all<Party>('parties')).some((p) => p.id !== id && same(p.name, next.name))) throw new AppError('partyNameTaken', { name: next.name })
    const row = { ...current, ...changes, name: next.name, balance: current.balance + delta, updatedAt: now }
    await m.batch([{ store: 'parties', put: [row] }, { store: 'outbox', put: [{ ...e, status: 'pending', error: undefined, number: next.name, payload: next } satisfies PartyEntry] }])
    await refreshOutboxState(m)
    return row
  }))
}

/** Delete a party that was made here and not sent yet. Returns false if it is not waiting (it is on the server). */
export function removeWaitingParty(m: Mirror, id: string): Promise<boolean> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (!e || e.kind !== 'party') return false
    const queue = await listOutbox(m)
    const using = billsUsing(queue, 'party', id).length + queue.filter(isReceiptEntry).filter((r) => r.payload.partyId === id).length
    if (using > 0) throw new AppError('partyInUse', { name: e.number, count: using })
    await m.batch([{ store: 'parties', remove: [id] }, { store: 'outbox', remove: [id] }])
    await refreshOutboxState(m)
    return true
  }))
}

/** Bills that failed only because the item or party they use was missing get another try once that is sorted out. */
const reopenDependents = (entries: OutboxEntry[]): OutboxEntry[] =>
  entries.filter((e) => isVoucherEntry(e) && e.status === 'failed' && (e.error?.key === 'lineItemGone' || e.error?.key === 'partyGone')).map((e) => ({ ...e, status: 'pending' as const, error: undefined }))

const settle = (e: OutboxEntry) => { if (e.kind !== 'item' && e.kind !== 'party') throw new AppError('serverError'); return e }

/**
 * "It is the same one that is already on the server." The queued item or party is dropped, and every waiting bill that used it
 * now points at the existing one. Stock typed in for the new item is not added to the existing item.
 */
export function useExisting(m: Mirror, entryId: string): Promise<void> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = settle((await m.get<OutboxEntry>('outbox', entryId))!)
    let found: Item | Party | undefined
    if (e.kind === 'item') found = (await api<{ data: Item[] }>('/items', { query: { q: e.payload.code, limit: 50 } })).data.find((i) => same(i.code, e.payload.code))
    else found = (await api<{ data: Party[] }>('/parties', { query: { q: e.payload.name, limit: 50 } })).data.find((p) => same(p.name, e.payload.name))
    if (!found) throw new AppError('mergeNotFound')

    const all = await listOutbox(m)
    const changedEntries: OutboxEntry[] = []
    const changedVouchers: Voucher[] = []
    for (const v of billsUsing(all, e.kind, entryId)) {
      const payload = e.kind === 'item'
        ? { ...v.payload, lines: v.payload.lines.map((l) => (l.itemId === entryId ? { ...l, itemId: found!.id } : l)) }
        : { ...v.payload, partyId: found!.id }
      changedEntries.push({ ...v, payload })
      const row = await m.get<Voucher>('vouchers', v.id)
      if (row) changedVouchers.push(e.kind === 'item'
        ? { ...row, lines: row.lines.map((l) => (l.itemId === entryId ? { ...l, itemId: found!.id } : l)) }
        : { ...row, partyId: found!.id, partyName: (found as Party).name })
    }
    // money waiting for the party that is being replaced goes to the existing one instead
    if (e.kind === 'party') {
      for (const r of all.filter(isReceiptEntry).filter((x) => x.payload.partyId === entryId)) changedEntries.push({ ...r, partyName: (found as Party).name, payload: { ...r.payload, partyId: found!.id } })
    }
    const queue = new Map(all.map((x) => [x.id, x]))
    for (const c of changedEntries) queue.set(c.id, c)
    queue.delete(entryId)
    const reopened = reopenDependents([...queue.values()])
    await m.batch([
      { store: e.kind === 'item' ? 'items' : 'parties', put: [found], remove: [entryId] },
      { store: 'vouchers', put: changedVouchers },
      { store: 'outbox', put: [...changedEntries.filter((c) => !reopened.some((r) => r.id === c.id)), ...reopened], remove: [entryId] },
    ])
    await refreshOutboxState(m)
  }))
}

/** "It is a different one": give it another code or name and send it again. */
export function renameRecord(m: Mirror, entryId: string, value: string): Promise<void> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = settle((await m.get<OutboxEntry>('outbox', entryId))!)
    const v = value.trim()
    if (!v) throw new AppError('serverError')
    if (e.kind === 'item') {
      const code = v.toUpperCase()
      const clash = (await m.all<Item>('items')).find((i) => i.id !== entryId && same(i.code, code))
      if (clash) throw new AppError('itemCodeUsedBy', { code, name: clash.name })
      const row = { ...(await m.get<Item>('items', entryId))!, code }
      await m.batch([{ store: 'items', put: [row] }, { store: 'outbox', put: [{ ...e, number: code, payload: { ...e.payload, code }, status: 'pending', error: undefined } satisfies ItemEntry] }])
    } else {
      if ((await m.all<Party>('parties')).some((p) => p.id !== entryId && same(p.name, v))) throw new AppError('partyNameTaken', { name: v })
      const row = { ...(await m.get<Party>('parties', entryId))!, name: v }
      await m.batch([{ store: 'parties', put: [row] }, { store: 'outbox', put: [{ ...e, number: v, payload: { ...e.payload, name: v }, status: 'pending', error: undefined } satisfies PartyEntry] }])
    }
    const reopened = reopenDependents(await listOutbox(m))
    if (reopened.length) await m.batch([{ store: 'outbox', put: reopened }])
    await refreshOutboxState(m)
  }))
}

/** Throw away an item or party that was made here and refused. Refused if waiting bills still use it. */
export function discardRecord(m: Mirror, id: string): Promise<void> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = settle((await m.get<OutboxEntry>('outbox', id))!)
    const queue = await listOutbox(m)
    const using = billsUsing(queue, e.kind, id).length + (e.kind === 'party' ? queue.filter(isReceiptEntry).filter((r) => r.payload.partyId === id).length : 0)
    if (using > 0) throw new AppError('recordInUse', { count: using })
    await m.batch([{ store: e.kind === 'item' ? 'items' : 'parties', remove: [id] }, { store: 'outbox', remove: [id] }])
    await refreshOutboxState(m)
  }))
}
