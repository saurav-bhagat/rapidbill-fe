import { calcVoucher } from '@/lib/calc'
import { newId } from '@/lib/id'
import type { Paise } from '@/lib/money'
import { roundQty } from '@/lib/qty'
import { nextVoucherNo } from '@/lib/voucherNo'
import { AppError, type ErrorKey, type ErrorParams } from './errors'
import { stampLedger } from './ledger'
import { createSettingsService } from './settings'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Item, type Party, type PaymentStatus, type Settings, type StockLedgerEntry, type Voucher, type VoucherLine, type VoucherMode } from './types'

export interface VoucherLineInput { itemId: string; qty: number; rate: Paise; discPct: number }

export interface VoucherInput {
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
  /** Mark cancelled (never deleted), restore stock and any credit balance. */
  cancel(id: string): Promise<Voucher>
}

interface World { settings: Settings; items: Item[]; parties: Party[]; vouchers: Voucher[]; ledger: StockLedgerEntry[] }

/** Put a voucher's stock (and credit) effect back. Pure: returns new arrays. */
function reverseEffect(v: Voucher, w: Pick<World, 'items' | 'parties'>, type: 'CANCEL' | 'EDIT_REVERSE', now: string) {
  const items = w.items.map((i) => ({ ...i }))
  const byId = new Map(items.map((i) => [i.id, i]))
  const entries: StockLedgerEntry[] = []
  for (const l of v.lines) {
    const it = byId.get(l.itemId)
    if (!it) continue // item no longer exists; nothing to restore
    it.currentStock = roundQty(it.currentStock + l.qty)
    it.updatedAt = now
    entries.push(stampLedger({ itemId: it.id, type, qtyDelta: l.qty, balanceAfter: it.currentStock, voucherId: v.id, voucherNo: v.number }, now))
  }
  const parties = v.partyId && v.payment === 'CREDIT'
    ? w.parties.map((p) => (p.id === v.partyId ? { ...p, balance: p.balance - v.totals.grandTotal, updatedAt: now } : p))
    : w.parties
  return { items, parties, entries }
}

export function createBillingService(adapter: StorageAdapter): BillingService {
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
  function issue(input: VoucherInput, w: World, others: Voucher[], id: string, now: string, keep?: { number: string; createdAt: string }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail('dateInvalid')
    if (input.lines.length === 0) fail('noItems')
    const byId = new Map(w.items.map((i) => [i.id, i]))
    input.lines.forEach((l, n) => {
      if (!byId.has(l.itemId)) fail('lineItemGone', { n: n + 1 })
      if (!(l.qty > 0) || !Number.isFinite(l.qty)) fail('lineQty', { n: n + 1 })
      if (!(l.rate >= 0)) fail('lineRate', { n: n + 1 })
      if (!(l.discPct >= 0 && l.discPct <= 100)) fail('lineDisc', { n: n + 1 })
    })

    // Stock never blocks a bill: goods can be on the shelf before the count is updated. Stock simply goes negative until someone fixes the count.

    const typed = input.number?.trim()
    if (typed && others.some((v) => v.number.toLowerCase() === typed.toLowerCase())) {
      throw new BillingError('duplicateNumber', 'DUPLICATE_NUMBER', { number: typed })
    }
    const number = typed || keep?.number || nextVoucherNo(others.map((v) => v.number), w.settings.invoicePrefix, Number(input.date.slice(0, 4)))

    const party = input.partyId ? w.parties.find((p) => p.id === input.partyId) : null
    if (input.partyId && !party) fail('partyGone')

    // Non-GST business: never any tax. Otherwise a Tax Invoice is always taxed and a Challan follows the toggle.
    const taxApplicable = w.settings.gstEnabled === false ? false : input.mode === 'TAX_INVOICE' ? true : input.taxApplicable
    const calc = calcVoucher({
      lines: input.lines.map((l) => ({ qty: l.qty, rate: l.rate, discPct: l.discPct, gstPct: byId.get(l.itemId)!.gstPercent })),
      taxApplicable, sellerState: w.settings.stateCode, partyState: party?.stateCode ?? null,
      billDiscount: input.billDiscount ?? undefined, roundOff: input.roundOff,
    })

    const lines: VoucherLine[] = input.lines.map((l, i) => {
      const it = byId.get(l.itemId)!
      return {
        itemId: it.id, name: it.name, code: it.code, hsn: it.hsn, batchNo: it.batchNo, expiry: it.expiry, unit: it.unit,
        qty: l.qty, mrp: it.mrp, rate: l.rate, discPct: l.discPct, gstPct: it.gstPercent,
        taxable: calc.lines[i].taxable, tax: calc.lines[i].tax, total: calc.lines[i].total,
      }
    })
    const voucher: Voucher = {
      id, workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: keep?.createdAt ?? now, updatedAt: now,
      number, date: input.date, mode: input.mode, taxApplicable, rateBasis: input.rateBasis,
      partyId: party?.id ?? null, partyName: party?.name ?? 'Cash / Counter Issue', partyGstin: party?.gstin ?? '',
      partyStateCode: party?.stateCode ?? null, partyAddress: party?.address ?? '', remarks: input.remarks.trim(),
      lines, billDiscount: input.billDiscount,
      totals: {
        itemCount: calc.itemCount, totalQty: roundQty(calc.totalQty), gross: calc.gross, lineDiscount: calc.lineDiscount,
        billDiscount: calc.billDiscount, taxable: calc.taxable, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
        roundOff: calc.roundOff, grandTotal: calc.grandTotal,
      },
      payment: input.payment, status: 'ACTIVE',
    }

    // Line by line, so repeated items get a correct running balance.
    const items = w.items.map((i) => ({ ...i }))
    const nextById = new Map(items.map((i) => [i.id, i]))
    const entries: StockLedgerEntry[] = []
    for (const l of input.lines) {
      const it = nextById.get(l.itemId)!
      it.currentStock = roundQty(it.currentStock - l.qty)
      it.updatedAt = now
      entries.push(stampLedger({ itemId: it.id, type: 'ISSUE', qtyDelta: -l.qty, balanceAfter: it.currentStock, voucherId: id, voucherNo: number }, now))
    }
    const parties = party && input.payment === 'CREDIT'
      ? w.parties.map((p) => (p.id === party.id ? { ...p, balance: p.balance + calc.grandTotal, updatedAt: now } : p))
      : w.parties
    return { voucher, items, parties, entries }
  }

  return {
    async nextNumber(dateISO) {
      const [settings, vouchers] = await Promise.all([settingsSvc.get(), adapter.read<Voucher>('vouchers')])
      return nextVoucherNo(vouchers.map((v) => v.number), settings.invoicePrefix, Number(dateISO.slice(0, 4)))
    },

    async save(input) {
      const w = await load()
      const now = new Date().toISOString()
      const r = issue(input, w, w.vouchers, newId(), now)
      await commit(w, { items: r.items, ledger: [...w.ledger, ...r.entries], parties: r.parties, vouchers: [...w.vouchers, r.voucher] })
      return r.voucher
    },

    async update(id, input) {
      const w = await load()
      const old = w.vouchers.find((v) => v.id === id)
      if (!old) throw new BillingError('voucherNotFound', 'VALIDATION')
      if (old.status !== 'ACTIVE') throw new BillingError('cancelledNoEdit', 'VALIDATION')
      const now = new Date().toISOString()
      const back = reverseEffect(old, w, 'EDIT_REVERSE', now)
      const others = w.vouchers.filter((v) => v.id !== id)
      const r = issue(input, { ...w, items: back.items, parties: back.parties }, others, id, now, { number: old.number, createdAt: old.createdAt })
      await commit(w, {
        items: r.items, ledger: [...w.ledger, ...back.entries, ...r.entries], parties: r.parties,
        vouchers: w.vouchers.map((v) => (v.id === id ? r.voucher : v)),
      })
      return r.voucher
    },

    async cancel(id) {
      const w = await load()
      const old = w.vouchers.find((v) => v.id === id)
      if (!old) throw new BillingError('voucherNotFound', 'VALIDATION')
      if (old.status === 'CANCELLED') throw new BillingError('alreadyCancelled', 'VALIDATION')
      const now = new Date().toISOString()
      const back = reverseEffect(old, w, 'CANCEL', now)
      const cancelled: Voucher = { ...old, status: 'CANCELLED', cancelledAt: now, updatedAt: now }
      await commit(w, { items: back.items, ledger: [...w.ledger, ...back.entries], parties: back.parties, vouchers: w.vouchers.map((v) => (v.id === id ? cancelled : v)) })
      return cancelled
    },
  }
}
