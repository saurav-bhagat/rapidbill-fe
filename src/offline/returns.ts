import { newId } from '@/lib/id'
import { roundQty } from '@/lib/qty'
import { billInterState, buildReturn } from '@/lib/returns'
import { AppError } from '@/services/errors'
import type { BillingOwner } from '@/services/voucher'
import type { Item, Party, ReturnInput, SalesReturn, Voucher } from '@/services/types'
import type { Mirror } from './db'
import { exclusive, flushLock, isReturnEntry, listOutbox, refreshOutboxState, type OutboxEntry, type ReturnEntry } from './outbox'

/**
 * Goods back on a bill while there is no connection. Like a bill it is worked out and saved on this device in one transaction with its
 * place in the queue: stock goes up here, the bill's "returned" counts go up, and the party's balance drops if the money is taken off it.
 * The server gives the number when it arrives, and its own check (nothing comes back twice) has the last word.
 */
export function createReturnLocally(m: Mirror, owner: BillingOwner, input: ReturnInput, id = newId(), clientCreatedAt = new Date().toISOString()): Promise<SalesReturn> {
  return exclusive('rapidbill-local-write', async () => {
    const bill = await m.get<Voucher>('vouchers', input.invoiceId)
    if (!bill) throw new AppError('voucherNotFound')
    if (bill.status !== 'ACTIVE') throw new AppError('returnBillCancelled')
    if (input.date < bill.date) throw new AppError('returnBeforeBill', { date: bill.date })
    if (input.settlement === 'ADJUST' && !bill.partyId) throw new AppError('returnNoParty')
    const interState = billInterState(bill)
    const built = buildReturn(bill, input.lines, interState)
    if ('key' in built) { const { key, ...params } = built; throw new AppError(key, params) }

    const lines = built.lines.map((x) => {
      const l = bill.lines[x.line]!
      return { ...x, itemId: l.itemId, name: l.name, code: l.code, hsn: l.hsn, unit: l.unit, per: l.per ?? 1, baseUnit: l.baseUnit ?? l.unit, rate: l.rate, discPct: l.discPct, gstPct: l.gstPct }
    })
    const record: SalesReturn = {
      id, workspaceId: owner.workspaceId, createdBy: owner.userId, createdAt: clientCreatedAt, updatedAt: clientCreatedAt,
      number: '', date: input.date, invoiceId: bill.id, invoiceNo: bill.number, invoiceDate: bill.date, taxApplicable: bill.taxApplicable, interState,
      partyId: bill.partyId, partyName: bill.partyName, partyGstin: bill.partyGstin, partyStateCode: bill.partyStateCode, partyAddress: bill.partyAddress,
      lines, totals: built.totals, settlement: input.settlement, reason: input.reason, status: 'ACTIVE', waiting: true,
    }
    const effects = await apply(m, record, 1, clientCreatedAt)
    const all = await listOutbox(m)
    const entry: ReturnEntry = {
      kind: 'return', id, seq: (all.at(-1)?.seq ?? 0) + 1, status: 'pending', number: bill.number, partyName: bill.partyName, total: built.totals.grandTotal,
      payload: { ...input, id, clientCreatedAt }, record, attempts: 0, createdAt: clientCreatedAt,
    }
    await m.batch([...effects, { store: 'outbox', put: [entry] }])
    await refreshOutboxState(m)
    return record
  })
}

/** The device-copy changes a return makes (sign 1) or takes back (sign -1): the bill's counts, the stock, and the party's balance. */
async function apply(m: Mirror, r: SalesReturn, sign: 1 | -1, now: string) {
  const ops: { store: 'vouchers' | 'items' | 'parties'; put: object[] }[] = []
  const bill = await m.get<Voucher>('vouchers', r.invoiceId)
  if (bill) {
    const returned = bill.lines.map((_, i) => bill.returned?.[i] ?? 0)
    for (const l of r.lines) returned[l.line] = roundQty(Math.max(0, (returned[l.line] ?? 0) + sign * l.qty))
    ops.push({ store: 'vouchers', put: [{ ...bill, returned }] })
  }
  const changed = new Map<string, Item>()
  for (const l of r.lines) {
    const it = changed.get(l.itemId) ?? (await m.get<Item>('items', l.itemId))
    if (it) changed.set(it.id, { ...it, currentStock: roundQty(it.currentStock + sign * l.stockQty), updatedAt: now })
  }
  if (changed.size) ops.push({ store: 'items', put: [...changed.values()] })
  if (r.settlement === 'ADJUST' && r.partyId) {
    const p = await m.get<Party>('parties', r.partyId)
    if (p) ops.push({ store: 'parties', put: [{ ...p, balance: p.balance - sign * r.totals.grandTotal, updatedAt: now }] })
  }
  return ops
}

async function drop(m: Mirror, e: ReturnEntry): Promise<SalesReturn> {
  const now = new Date().toISOString()
  await m.batch([...(await apply(m, e.record, -1, now)), { store: 'outbox', remove: [e.id] }])
  await refreshOutboxState(m)
  return { ...e.record, status: 'CANCELLED', cancelledAt: now }
}

/** Cancel a return still waiting here: its effects are taken back and it leaves the queue. undefined = not waiting (cancel it on the server). */
export function cancelWaitingReturn(m: Mirror, id: string): Promise<SalesReturn | undefined> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (!e || !isReturnEntry(e)) return undefined
    return drop(m, e)
  }))
}

/** Throw away a return the server refused (the person chose to): its effects on this device are taken back. */
export function discardReturn(m: Mirror, id: string): Promise<void> {
  return exclusive(flushLock(m), () => exclusive('rapidbill-local-write', async () => {
    const e = await m.get<OutboxEntry>('outbox', id)
    if (e && isReturnEntry(e)) await drop(m, e)
  }))
}

/** Returns made here and not sent yet (or refused), newest first. */
export async function waitingReturns(m: Mirror, invoiceId?: string): Promise<SalesReturn[]> {
  return (await listOutbox(m)).filter(isReturnEntry).filter((e) => !invoiceId || e.payload.invoiceId === invoiceId).map((e) => e.record).reverse()
}
