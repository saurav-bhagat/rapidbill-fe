import { newId } from '@/lib/id'
import { AppError } from '@/services/errors'
import type { BillingOwner } from '@/services/voucher'
import type { Party, Receipt, ReceiptInput } from '@/services/types'
import type { Mirror } from './db'
import { exclusive, flushLock, isReceiptEntry, listOutbox, refreshOutboxState, type OutboxEntry, type ReceiptEntry } from './outbox'

/**
 * Money received from a party while there is no connection. Like a bill it is saved on this device and queued in one transaction:
 * the party's balance drops here at once, and the queue sends the receipt later (with an id chosen here, so it is saved once).
 * The server gives it its number, so a waiting receipt has none yet.
 */
const asReceipt = (e: ReceiptEntry, owner?: BillingOwner): Receipt => ({
  id: e.id, workspaceId: owner?.workspaceId ?? '', createdBy: owner?.userId ?? '', createdAt: e.payload.clientCreatedAt, updatedAt: e.payload.clientCreatedAt,
  number: '', date: e.payload.date, partyId: e.payload.partyId, partyName: e.partyName, amount: e.payload.amount, mode: e.payload.mode, note: e.payload.note,
  status: 'ACTIVE', waiting: true,
})

export function createReceiptLocally(m: Mirror, owner: BillingOwner, input: ReceiptInput, id = newId(), clientCreatedAt = new Date().toISOString()): Promise<Receipt> {
  return exclusive('rapidbill-local-write', async () => {
    const party = await m.get<Party>('parties', input.partyId)
    if (!party) throw new AppError('partyNotFound')
    const all = await listOutbox(m)
    const entry: ReceiptEntry = {
      kind: 'receipt', id, seq: (all.at(-1)?.seq ?? 0) + 1, status: 'pending', number: '', partyName: party.name, total: input.amount,
      payload: { ...input, id, clientCreatedAt }, attempts: 0, createdAt: clientCreatedAt,
    }
    await m.batch([
      { store: 'parties', put: [{ ...party, balance: party.balance - input.amount, updatedAt: clientCreatedAt }] },
      { store: 'outbox', put: [entry] },
    ])
    await refreshOutboxState(m)
    return asReceipt(entry, owner)
  })
}

/** Receipts made here and not sent yet (or refused), newest first. */
export async function waitingReceipts(m: Mirror, partyId?: string): Promise<Receipt[]> {
  return (await listOutbox(m)).filter(isReceiptEntry).filter((e) => !partyId || e.payload.partyId === partyId).map((e) => asReceipt(e)).reverse()
}

/** Take back a receipt that has not reached the server (cancelled by the person, or refused and thrown away): the money goes back on the balance here. */
async function dropReceipt(m: Mirror, id: string, e: OutboxEntry): Promise<Receipt> {
  const r = e as ReceiptEntry
  const party = await m.get<Party>('parties', r.payload.partyId)
  await m.batch([
    ...(party ? [{ store: 'parties' as const, put: [{ ...party, balance: party.balance + r.payload.amount, updatedAt: new Date().toISOString() }] }] : []),
    { store: 'outbox', remove: [id] },
  ])
  await refreshOutboxState(m)
  return { ...asReceipt(r), status: 'CANCELLED' }
}

/** Cancel a receipt still waiting on this device. Returns undefined when it is not waiting (it is on the server and must be cancelled there). */
export function cancelWaitingReceipt(m: Mirror, id: string): Promise<Receipt | undefined> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (!e || !isReceiptEntry(e)) return undefined
    return dropReceipt(m, id, e)
  }))
}

/** Throw away a receipt the server refused (the person chose to): the money goes back on the balance here, since the server never counted it. */
export function discardReceipt(m: Mirror, id: string): Promise<void> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (e && isReceiptEntry(e)) await dropReceipt(m, id, e)
  }))
}

/** Receipts waiting in the queue for a party (a party made here cannot be thrown away while money for it is waiting). */
export const receiptsFor = (entries: OutboxEntry[], partyId: string): ReceiptEntry[] => entries.filter(isReceiptEntry).filter((e) => e.payload.partyId === partyId)
