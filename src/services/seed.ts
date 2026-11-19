import { calcVoucher } from '@/lib/calc'
import { newId } from '@/lib/id'
import { toPaise } from '@/lib/money'
import { format, subDays } from 'date-fns'
import { stampLedger, type NewLedgerEntry } from './ledger'
import { defaultSettings } from './settings'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Item, type Meta, type Party, type StockLedgerEntry, type Unit, type Voucher } from './types'
import { formatVoucherNo } from '@/lib/voucherNo'

const meta = (at: string): Meta => ({ id: newId(), workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: at, updatedAt: at })

// name, category, hsn, unit, batch, expiry, mrp, purchase, issue, gst, opening, low  (rupees)
type Row = [string, string, string, Unit, string, string, number, number, number, number, number, number]
const ITEM_ROWS: Row[] = [
  // Pharma
  ['Paracetamol 500mg Tab', 'Cipla', '30049099', 'STRIP', 'PCM2411', '08/27', 28.5, 17, 23, 12, 240, 40],
  ['Dolo 650 Tab', 'Micro Labs', '30049099', 'STRIP', 'D6502509', '03/28', 34, 21, 28.5, 12, 180, 40],
  ['Amoxicillin 500mg Cap', 'Cipla', '30041010', 'STRIP', 'AMX9917', '01/27', 112, 68, 92, 12, 90, 20],
  ['Azithromycin 500mg Tab', 'Zydus', '30042099', 'STRIP', 'AZ50331', '11/26', 118, 71, 96, 12, 8, 15],
  ['Cetirizine 10mg Tab', 'Dr Reddys', '30049099', 'STRIP', 'CTZ1182', '06/27', 42, 24, 33, 12, 150, 30],
  ['ORS Powder Orange 21g', 'FDC', '30049099', 'PCS', 'ORS7741', '12/26', 24, 14, 19, 5, 300, 50],
  ['Digene Gel Mint 200ml', 'Abbott', '30049099', 'PCS', 'DG2290', '09/27', 135, 84, 110, 12, 0, 12],
  ['Betadine Ointment 20g', 'Win-Medicare', '30049099', 'PCS', 'BTD4410', '05/27', 98, 61, 80, 12, 60, 10],
  // FMCG
  ['Surf Excel Easy Wash 1kg', 'HUL', '34022090', 'PCS', '', '', 135, 98, 118, 18, 120, 24],
  ['Dettol Soap 125g', 'Reckitt', '34011190', 'PCS', '', '', 68, 47, 58, 18, 400, 60],
  ['Colgate Strong Teeth 200g', 'Colgate', '33061020', 'PCS', '', '', 120, 85, 104, 18, 220, 30],
  ['Parle-G Biscuit 800g', 'Parle', '19053100', 'PCS', '', '', 80, 62, 72, 18, 150, 20],
  ['Maggi 2-Minute Noodles 12pk', 'Nestle', '19023090', 'BOX', '', '', 168, 132, 150, 18, 75, 10],
  ['Tata Salt 1kg', 'Tata Consumer', '25010020', 'PCS', '', '', 28, 21, 25, 0, 500, 80],
  // General
  ['A4 Copier Paper 75GSM Ream', 'JK Paper', '48025590', 'NOS', '', '', 380, 295, 345, 12, 40, 10],
  ['LED Bulb 9W Cool White', 'Syska', '85395000', 'PCS', '', '', 99, 62, 85, 12, 6, 15],
  ['Extension Board 4 Socket 3m', 'Anchor', '85366990', 'NOS', '', '', 450, 310, 395, 18, 28, 5],
  ['Gel Pen Blue (Box of 10)', 'Reynolds', '96081019', 'BOX', '', '', 100, 62, 85, 12, 55, 10],
]

const PARTY_ROWS: [string, Party['type'], string, string, string, string, string][] = [
  ['Apollo Pharmacy, Koramangala', 'CUSTOMER', '29AABCA1234F1Z5', '29', '80 Feet Road, Koramangala 4th Block, Bengaluru 560034', '080 4112 9087', '1245000'],
  ['Sri Lakshmi Medicals', 'CUSTOMER', '29BKPPL5521D1Z1', '29', '22, Gandhi Bazaar, Basavanagudi, Bengaluru 560004', '98450 11273', '0'],
  ['Hyderabad Branch', 'BRANCH', '36AAKFS4821M1ZR', '36', 'Plot 18, Kukatpally Industrial Area, Hyderabad 500072', '040 2315 7790', '0'],
  ['Mehta Distributors', 'CUSTOMER', '27AAFFM7743K1ZU', '27', 'Shop 5, Crawford Market, Mumbai 400001', '022 2342 1199', '8760050'],
  ['Godown Department', 'DEPARTMENT', '', '29', 'Rear Godown, 14 Market Road, Bengaluru 560011', '', '0'],
]

export interface SeedBundle {
  items: Item[]
  parties: Party[]
  vouchers: Voucher[]
  ledger: StockLedgerEntry[]
}

export function buildSeed(now = new Date()): SeedBundle {
  const created = subDays(now, 5).toISOString()
  const items: Item[] = ITEM_ROWS.map((r, i) => ({
    ...meta(created),
    name: r[0], code: `ITM-${1001 + i}`, category: r[1], hsn: r[2], unit: r[3], batchNo: r[4], expiry: r[5],
    mrp: toPaise(r[6]), purchaseRate: toPaise(r[7]), issueRate: toPaise(r[8]), gstPercent: r[9],
    currentStock: r[10], lowStockThreshold: r[11],
  }))
  const parties: Party[] = PARTY_ROWS.map((r) => ({
    ...meta(created), name: r[0], type: r[1], gstin: r[2], stateCode: r[3], address: r[4], phone: r[5], balance: Number(r[6]),
  }))

  const ledgerNew: { e: NewLedgerEntry; at: string }[] = items.map((it) => ({
    at: created,
    e: { itemId: it.id, type: 'OPENING', qtyDelta: it.currentStock, balanceAfter: it.currentStock, note: 'Opening stock' },
  }))

  const byName = (n: string) => items.find((i) => i.name.startsWith(n))!
  const sellerState = defaultSettings().stateCode
  const specs: { daysAgo: number; party: Party | null; mode: Voucher['mode']; tax: boolean; basis: Voucher['rateBasis']; pay: Voucher['payment']; remarks: string; lines: [string, number, number][] }[] = [
    { daysAgo: 3, party: parties[0], mode: 'TAX_INVOICE', tax: true, basis: 'SALE', pay: 'CREDIT', remarks: 'PO #442', lines: [['Paracetamol', 40, 0], ['Dolo 650', 30, 2], ['Cetirizine', 20, 0], ['ORS Powder', 50, 0]] },
    { daysAgo: 1, party: parties[3], mode: 'TAX_INVOICE', tax: true, basis: 'SALE', pay: 'CREDIT', remarks: 'Via transporter, LR 88213', lines: [['Surf Excel', 24, 3], ['Dettol Soap', 60, 0], ['Parle-G', 20, 0]] },
    { daysAgo: 0, party: null, mode: 'CHALLAN', tax: false, basis: 'COST', pay: 'INTERNAL', remarks: 'Issued to counter', lines: [['A4 Copier', 5, 0], ['Gel Pen', 4, 0], ['LED Bulb', 2, 0]] },
  ]

  const vouchers: Voucher[] = specs.map((s, idx) => {
    const d = subDays(now, s.daysAgo)
    const at = d.toISOString()
    const lines = s.lines.map(([n, qty, disc]) => {
      const it = byName(n)
      return { it, qty, disc }
    })
    const calc = calcVoucher({
      lines: lines.map(({ it, qty, disc }) => ({ qty, rate: s.basis === 'COST' ? it.purchaseRate : it.issueRate, discPct: disc, gstPct: it.gstPercent })),
      taxApplicable: s.tax, sellerState, partyState: s.party?.stateCode ?? null, roundOff: true,
    })
    const id = newId()
    const number = formatVoucherNo('SI', d.getFullYear(), idx + 1)
    lines.forEach(({ it, qty }) => {
      it.currentStock -= qty
      ledgerNew.push({ at, e: { itemId: it.id, type: 'ISSUE', qtyDelta: -qty, balanceAfter: it.currentStock, voucherId: id, voucherNo: number } })
    })
    return {
      ...meta(at), id, number, date: format(d, 'yyyy-MM-dd'), mode: s.mode, taxApplicable: s.tax, rateBasis: s.basis,
      partyId: s.party?.id ?? null, partyName: s.party?.name ?? 'Cash / Counter Issue', partyGstin: s.party?.gstin ?? '',
      partyStateCode: s.party?.stateCode ?? null, partyAddress: s.party?.address ?? '', remarks: s.remarks,
      lines: lines.map(({ it, qty, disc }, i) => ({
        itemId: it.id, name: it.name, code: it.code, hsn: it.hsn, batchNo: it.batchNo, expiry: it.expiry, unit: it.unit, qty,
        mrp: it.mrp, rate: s.basis === 'COST' ? it.purchaseRate : it.issueRate, discPct: disc, gstPct: it.gstPercent,
        taxable: calc.lines[i].taxable, tax: calc.lines[i].tax, total: calc.lines[i].total,
      })),
      billDiscount: null,
      totals: {
        itemCount: calc.itemCount, totalQty: calc.totalQty, gross: calc.gross, lineDiscount: calc.lineDiscount,
        billDiscount: calc.billDiscount, taxable: calc.taxable, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
        roundOff: calc.roundOff, grandTotal: calc.grandTotal,
      },
      payment: s.pay, status: 'ACTIVE',
    }
  })

  const ledger = ledgerNew.map(({ e, at }) => stampLedger(e, at))
  return { items, parties, vouchers, ledger }
}

export async function writeSeed(adapter: StorageAdapter): Promise<void> {
  const s = buildSeed()
  await adapter.write('items', s.items)
  await adapter.write('parties', s.parties)
  await adapter.write('vouchers', s.vouchers)
  await adapter.write('ledger', s.ledger)
  await adapter.write('settings', [defaultSettings()])
}
