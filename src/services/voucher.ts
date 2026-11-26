import { calcVoucher, chargedInterState, matchSavedLines } from '@/lib/calc'
import { newId } from '@/lib/id'
import type { Paise } from '@/lib/money'
import { roundQty } from '@/lib/qty'
import { lineStockQty, sellingUnit, stockQtyOf } from '@/lib/units'
import { dueOf } from '@/lib/invoice'
import { financialYearOf, nextVoucherNo } from '@/lib/voucherNo'
import { AppError, type ErrorKey, type ErrorParams } from './errors'
import { stampLedger } from './ledger'
import { createSettingsService } from './settings'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Unit, type Item, type Party, type PaymentStatus, type ReceiptMode, type Settings, type StockLedgerEntry, type Voucher, type VoucherLine, type VoucherMode } from './types'

/** `unit` is one of the item's alternate units; leave it out to sell in the item's own unit. `rate` is always per the item's own unit. */
export interface VoucherLineInput { itemId: string; qty: number; rate: Paise; discPct: number; unit?: Unit }

export interface VoucherInput {
  /** Chosen by the device, so a bill sent twice is saved once. */
  id?: string
  /** When the bill was really made (it can reach the server later). */
  clientCreatedAt?: string
  /** Leave empty to auto-assign the next number in the series. */
  number?: string
  /** ISO yyyy-MM-dd */
  date: string
  mode: VoucherMode
  /** Ignored for TAX_INVOICE (always taxed). */
  taxApplicable: boolean
  rateBasis: 'SALE' | 'COST'
  partyId: string | null
  remarks: string
  lines: VoucherLineInput[]
  billDiscount: { type: 'PCT' | 'AMT'; value: number } | null
  roundOff: boolean
  payment: PaymentStatus
  /** Credit bills only: money received now (paise, less than the total) and how. The rest is added to the party's balance. */
  paidAmount?: Paise
  paidMode?: ReceiptMode
}

export interface Shortage { itemId: string; name: string; available: number; requested: number }

export type BillingErrorCode = 'VALIDATION' | 'STOCK' | 'DUPLICATE_NUMBER' | 'STORAGE'
export class BillingError extends AppError {
  constructor(key: ErrorKey, public code: BillingErrorCode, params: ErrorParams = {}, public shortages: Shortage[] = []) {
    super(key, params)
    this.name = 'BillingError'
  }
}

export interface BillingService {
  nextNumber(dateISO: string): Promise<string>
  /** Validates, then deducts stock + writes ledger + saves voucher as one unit (rolls back on failure). */
  save(input: VoucherInput): Promise<Voucher>
  /** Edit an active voucher: reverse its old stock effect, apply the new one. Keeps id and (unless changed) number. */
  update(id: string, input: VoucherInput): Promise<Voucher>
  /**
   * Mark cancelled (never deleted), restore stock and any credit balance. A credit bill part paid when it was made: `keepPaid` keeps
   * that money as the party's advance (their balance goes down by it); otherwise it was given back.
   */
  cancel(id: string, opts?: { keepPaid?: boolean }): Promise<Voucher>
}

interface World { settings: Settings; items: Item[]; parties: Party[]; vouchers: Voucher[]; ledger: StockLedgerEntry[] }

/** Put a voucher's stock (and credit) effect back. Pure: returns new arrays. */
function reverseEffect(v: Voucher, w: Pick<World, 'items' | 'parties'>, type: 'CANCEL' | 'EDIT_REVERSE', now: string, keepPaid = false) {
  const items = w.items.map((i) => ({ ...i }))
  const byId = new Map(items.map((i) => [i.id, i]))
  const entries: StockLedgerEntry[] = []
  for (const l of v.lines) {
    const it = byId.get(l.itemId)
    if (!it) continue // item no longer exists; nothing to restore
    const back = lineStockQty(l)
    it.currentStock = roundQty(it.currentStock + back)
    it.updatedAt = now
    entries.push(stampLedger({ itemId: it.id, type, qtyDelta: back, balanceAfter: it.currentStock, voucherId: v.id, voucherNo: v.number }, now))
  }
  // same rule as the server: cancelling a part-paid credit bill can keep the money paid at billing as the party's advance
  const kept = type === 'CANCEL' && keepPaid && v.payment === 'CREDIT' ? v.paidAmount ?? 0 : 0
  const off = dueOf(v) + kept
  const parties = v.partyId && off > 0
    ? w.parties.map((p) => (p.id === v.partyId ? { ...p, balance: p.balance - off, updatedAt: now } : p))
    : w.parties
  return { items, parties, entries }
}

/** Who the records belong to. Browser-only mode has one fixed owner; with an account it is the signed-in user's workspace. */
export interface BillingOwner { workspaceId: string; userId: string }

export function createBillingService(adapter: StorageAdapter, owner: BillingOwner = { workspaceId: WORKSPACE_ID, userId: LOCAL_USER }): BillingService {
  const settingsSvc = createSettingsService(adapter)

  const load = async (): Promise<World> => {
    const [settings, items, parties, vouchers, ledger] = await Promise.all([
      settingsSvc.get(), adapter.read<Item>('items'), adapter.read<Party>('parties'), adapter.read<Voucher>('vouchers'), adapter.read<StockLedgerEntry>('ledger'),
    ])
    return { settings, items, parties, vouchers, ledger }
  }

  /** Write all changed collections; on any failure put every one back to the snapshot. */
  const commit = async (before: World, after: Omit<World, 'settings'>) => {
    const written: (keyof typeof after)[] = []
    try {
      for (const name of ['items', 'ledger', 'parties', 'vouchers'] as const) {
        if (after[name] === before[name]) continue
        await adapter.write(name, after[name] as unknown[])
        written.push(name)
      }
    } catch (err) {
      for (const name of written) await adapter.write(name, before[name] as unknown[]).catch(() => undefined)
      throw err instanceof Error ? new BillingError('saveFailed', 'STORAGE', { reason: err.message }) : new BillingError('saveFailedGeneric', 'STORAGE')
    }
  }

  const fail = (key: ErrorKey, params: ErrorParams = {}): never => { throw new BillingError(key, 'VALIDATION', params) }

  /**
   * Validate input against `w` (stock already adjusted for any reversal) and build the voucher plus
   * its stock/ledger/credit effects. `others` = every other voucher, for number uniqueness.
   */
  function issue(input: VoucherInput, w: World, others: Voucher[], id: string, now: string, keep?: Voucher) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail('dateInvalid')
    if (input.lines.length === 0) fail('noItems')
    const byId = new Map(w.items.map((i) => [i.id, i]))
    input.lines.forEach((l, n) => {
      if (!byId.has(l.itemId)) fail('lineItemGone', { n: n + 1 })
      if (!(l.qty > 0) || !Number.isFinite(l.qty)) fail('lineQty', { n: n + 1 })
      if (!(l.rate >= 0)) fail('lineRate', { n: n + 1 })
      if (!(l.discPct >= 0 && l.discPct <= 100)) fail('lineDisc', { n: n + 1 })
      if (!sellingUnit(byId.get(l.itemId)!, l.unit)) fail('lineUnit', { n: n + 1, unit: l.unit ?? '' })
    })
    /** What each line takes from stock, in the item's own unit. */
    const sold = input.lines.map((l) => { const s = sellingUnit(byId.get(l.itemId)!, l.unit)!; return { unit: s.unit, per: s.per, stockQty: stockQtyOf(l.qty, s.per) } })

    // Stock never blocks a bill: goods can be on the shelf before the count is updated. Stock simply goes negative until someone fixes the count.

    const typed = input.number?.trim()
    if (typed && others.some((v) => v.number.toLowerCase() === typed.toLowerCase())) {
      throw new BillingError('duplicateNumber', 'DUPLICATE_NUMBER', { number: typed })
    }
    const number = typed || keep?.number || nextVoucherNo(others.map((v) => v.number), w.settings.invoicePrefix, financialYearOf(input.date))

    const party = input.partyId ? w.parties.find((p) => p.id === input.partyId) : null
    if (input.partyId && !party) fail('partyGone')

    // An edit keeps what the bill was made with (same rule as the server): lines that were on it keep their saved name, HSN, GST rate,
    // batch and MRP, and the same party keeps its saved details and tax split. Only lines added now use today's item.
    const savedOf = matchSavedLines(input.lines.map((l) => l.itemId), keep?.lines)
    const sameParty = !!keep && (keep.partyId ?? null) === (input.partyId ?? null)

    // Non-GST business: never any tax. Otherwise a Tax Invoice is always taxed and a Challan follows the toggle.
    const taxApplicable = w.settings.gstEnabled === false ? false : input.mode === 'TAX_INVOICE' ? true : input.taxApplicable
    const calc = calcVoucher({
      lines: input.lines.map((l, i) => ({ qty: sold[i].stockQty, rate: l.rate, discPct: l.discPct, gstPct: savedOf[i]?.gstPct ?? byId.get(l.itemId)!.gstPercent })),
      taxApplicable, sellerState: w.settings.stateCode, partyState: sameParty ? keep!.partyStateCode : party?.stateCode ?? null,
      billDiscount: input.billDiscount ?? undefined, roundOff: input.roundOff,
      ...(sameParty && { interState: chargedInterState(keep!.totals) }),
    })

    // Only a credit bill can be part paid; the unpaid rest is what goes onto the party's balance. Same rules, same error keys as the server.
    const paid = input.paidAmount ?? 0
    if (!Number.isInteger(paid) || paid < 0) fail('paidTooHigh')
    if (input.payment !== 'CREDIT' && paid > 0) fail('paidOnlyOnCredit')
    if (input.payment === 'CREDIT' && paid > 0) {
      if (paid >= calc.grandTotal) fail('paidTooHigh')
      if (!input.paidMode) fail('paidModeNeeded')
    }

    const lines: VoucherLine[] = input.lines.map((l, i) => {
      const it = byId.get(l.itemId)!
      const s = savedOf[i]
      return {
        itemId: it.id, name: s?.name ?? it.name, code: s?.code ?? it.code, hsn: s?.hsn ?? it.hsn, batchNo: s?.batchNo ?? it.batchNo, expiry: s?.expiry ?? it.expiry, unit: sold[i].unit,
        qty: l.qty, per: sold[i].per, baseUnit: it.unit, stockQty: sold[i].stockQty, mrp: s?.mrp ?? it.mrp, rate: l.rate, discPct: l.discPct, gstPct: s?.gstPct ?? it.gstPercent,
        taxable: calc.lines[i].taxable, tax: calc.lines[i].tax, total: calc.lines[i].total,
      }
    })
    const voucher: Voucher = {
      id, workspaceId: owner.workspaceId, createdBy: owner.userId, createdAt: keep?.createdAt ?? now, updatedAt: now,
      number, date: input.date, mode: input.mode, taxApplicable, rateBasis: input.rateBasis,
      partyId: party?.id ?? null,
      ...(sameParty
        ? { partyName: keep!.partyName, partyGstin: keep!.partyGstin, partyStateCode: keep!.partyStateCode, partyAddress: keep!.partyAddress }
        : { partyName: party?.name ?? 'Cash / Counter Issue', partyGstin: party?.gstin ?? '', partyStateCode: party?.stateCode ?? null, partyAddress: party?.address ?? '' }),
      remarks: input.remarks.trim(),
      lines, billDiscount: input.billDiscount,
      totals: {
        itemCount: calc.itemCount, totalQty: roundQty(calc.totalQty), gross: calc.gross, lineDiscount: calc.lineDiscount,
        billDiscount: calc.billDiscount, taxable: calc.taxable, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
        roundOff: calc.roundOff, grandTotal: calc.grandTotal,
      },
      payment: input.payment, status: 'ACTIVE',
      ...(input.payment === 'CREDIT' && paid > 0 && { paidAmount: paid, paidMode: input.paidMode }),
      ...(input.clientCreatedAt && !keep && { clientCreatedAt: input.clientCreatedAt }),
    }

    // Line by line, so repeated items get a correct running balance.
    const items = w.items.map((i) => ({ ...i }))
    const nextById = new Map(items.map((i) => [i.id, i]))
    const entries: StockLedgerEntry[] = []
    for (const [i, l] of input.lines.entries()) {
      const it = nextById.get(l.itemId)!
      const out = sold[i].stockQty
      it.currentStock = roundQty(it.currentStock - out)
      it.updatedAt = now
      entries.push(stampLedger({ itemId: it.id, type: 'ISSUE', qtyDelta: -out, balanceAfter: it.currentStock, voucherId: id, voucherNo: number }, now))
    }
    const parties = party && input.payment === 'CREDIT'
      ? w.parties.map((p) => (p.id === party.id ? { ...p, balance: p.balance + calc.grandTotal - paid, updatedAt: now } : p))
      : w.parties
    return { voucher, items, parties, entries }
  }

  return {
    async nextNumber(dateISO) {
      const [settings, vouchers] = await Promise.all([settingsSvc.get(), adapter.read<Voucher>('vouchers')])
      return nextVoucherNo(vouchers.map((v) => v.number), settings.invoicePrefix, financialYearOf(dateISO))
    },

    async save(input) {
      const w = await load()
      const now = new Date().toISOString()
      const r = issue(input, w, w.vouchers, input.id ?? newId(), now)
      await commit(w, { items: r.items, ledger: [...w.ledger, ...r.entries], parties: r.parties, vouchers: [...w.vouchers, r.voucher] })
      return r.voucher
    },

    async update(id, input) {
      const w = await load()
      const old = w.vouchers.find((v) => v.id === id)
      if (!old) throw new BillingError('voucherNotFound', 'VALIDATION')
      if (old.status !== 'ACTIVE') throw new BillingError('cancelledNoEdit', 'VALIDATION')
      // its number belongs to the old financial year's series (same rule as the server)
      if (!input.number?.trim() && financialYearOf(old.date) !== financialYearOf(input.date)) throw new BillingError('editAcrossYear', 'VALIDATION')
      const now = new Date().toISOString()
      const back = reverseEffect(old, w, 'EDIT_REVERSE', now)
      const others = w.vouchers.filter((v) => v.id !== id)
      const r = issue(input, { ...w, items: back.items, parties: back.parties }, others, id, now, old)
      await commit(w, {
        items: r.items, ledger: [...w.ledger, ...back.entries, ...r.entries], parties: r.parties,
        vouchers: w.vouchers.map((v) => (v.id === id ? r.voucher : v)),
      })
      return r.voucher
    },

    async cancel(id, opts) {
      const w = await load()
      const old = w.vouchers.find((v) => v.id === id)
      if (!old) throw new BillingError('voucherNotFound', 'VALIDATION')
      if (old.status === 'CANCELLED') throw new BillingError('alreadyCancelled', 'VALIDATION')
      const now = new Date().toISOString()
      const back = reverseEffect(old, w, 'CANCEL', now, opts?.keepPaid)
      const cancelled: Voucher = { ...old, status: 'CANCELLED', cancelledAt: now, updatedAt: now }
      await commit(w, { items: back.items, ledger: [...w.ledger, ...back.entries], parties: back.parties, vouchers: w.vouchers.map((v) => (v.id === id ? cancelled : v)) })
      return cancelled
    },
  }
}
