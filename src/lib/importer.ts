import { nextItemCode, type Msg } from './itemForm'
import { toPaise } from './money'
import { roundQty } from './qty'
import { GST_SLABS, UNITS, type Item, type Meta, type Unit } from '@/services/types'

export type { Msg }
export type FieldKey = 'name' | 'code' | 'category' | 'hsn' | 'unit' | 'batchNo' | 'expiry' | 'mrp' | 'purchaseRate' | 'issueRate' | 'gstPercent' | 'currentStock' | 'lowStockThreshold'
export const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Item name', required: true }, { key: 'code', label: 'Item code / SKU' }, { key: 'category', label: 'Category / Company' },
  { key: 'hsn', label: 'HSN / SAC' }, { key: 'unit', label: 'Unit' }, { key: 'batchNo', label: 'Batch no.' }, { key: 'expiry', label: 'Expiry' },
  { key: 'mrp', label: 'MRP' }, { key: 'purchaseRate', label: 'Purchase rate' }, { key: 'issueRate', label: 'Issue / sale rate' },
  { key: 'gstPercent', label: 'GST %' }, { key: 'currentStock', label: 'Current stock' }, { key: 'lowStockThreshold', label: 'Low stock alert' },
]

export type Cell = string | number | boolean | Date | null | undefined
export type Mapping = Record<FieldKey, number> // column index, -1 = not mapped
export interface Sheet { name: string; rows: Cell[][] }

// Normalised header text (lowercase, letters and digits only) -> field. Marg, Vyapar and hand-made sheets all use different words.
const SYN: Record<FieldKey, string[]> = {
  name: ['itemname', 'item', 'product', 'productname', 'particulars', 'description', 'itemdescription', 'name', 'goods', 'articlename'],
  code: ['itemcode', 'code', 'sku', 'productcode', 'itemno', 'icode', 'itemid', 'partno'],
  category: ['category', 'company', 'mfr', 'manufacturer', 'brand', 'group', 'companyname', 'mfgcompany', 'itemgroup', 'mfg'],
  hsn: ['hsn', 'hsncode', 'hsnsac', 'sac', 'hsnsaccode'],
  unit: ['unit', 'uom', 'units', 'unitofmeasure'],
  batchNo: ['batch', 'batchno', 'batchnumber', 'batchnum'],
  expiry: ['expiry', 'exp', 'expirydate', 'expdate', 'expiration', 'expiryon'],
  mrp: ['mrp', 'maxretailprice', 'maxrp'],
  purchaseRate: ['prate', 'purchaserate', 'purchaseprice', 'cost', 'costprice', 'lastpurchaserate', 'purrate', 'buyrate', 'costrate', 'lpr'],
  issueRate: ['srate', 'salerate', 'sellingprice', 'rate', 'issuerate', 'saleprice', 'sprice', 'salesrate', 'sellrate', 'saleprice'],
  gstPercent: ['gst', 'gstpercent', 'gstrate', 'taxrate', 'tax', 'gstper', 'gstpct', 'igst'],
  currentStock: ['closingstock', 'clstock', 'clqty', 'closingqty', 'stock', 'qty', 'quantity', 'currentstock', 'balance', 'onhand', 'clstk', 'closing', 'stockqty', 'balqty'],
  lowStockThreshold: ['lowstock', 'reorderlevel', 'minstock', 'lowstockalert', 'minqty', 'reorderqty', 'minlevel'],
}

export const norm = (s: Cell): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (c: Cell): string => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString() : String(c).trim())

function score(header: string, syn: string): number {
  if (!header) return 0
  if (header === syn) return 100
  if (syn.length >= 4 && header.includes(syn)) return 60
  if (header.length >= 3 && syn.includes(header)) return 40
  return 0
}

/** Pick the row most likely to hold column titles (Marg reports have 2-3 title lines first). */
export function detectHeaderRow(rows: Cell[][], scan = 15): number {
  let best = 0, bestHits = -1
  rows.slice(0, scan).forEach((r, i) => {
    const hits = r.filter((c) => Object.values(SYN).some((list) => list.some((s) => score(norm(c), s) >= 60))).length
    if (hits > bestHits) { best = i; bestHits = hits }
  })
  return best
}

export function autoMap(headers: Cell[]): Mapping {
  const m = Object.fromEntries(FIELDS.map((f) => [f.key, -1])) as Mapping
  const cands: { field: FieldKey; col: number; s: number }[] = []
  headers.forEach((h, col) => {
    const n = norm(h)
    for (const f of FIELDS) {
      const s = Math.max(0, ...SYN[f.key].map((syn) => score(n, syn)))
      if (s >= 40) cands.push({ field: f.key, col, s })
    }
  })
  const usedCols = new Set<number>()
  // strongest matches first; each column and each field is used once
  cands.sort((a, b) => b.s - a.s || a.col - b.col).forEach((c) => {
    if (m[c.field] === -1 && !usedCols.has(c.col)) { m[c.field] = c.col; usedCols.add(c.col) }
  })
  return m
}

// ---- cell parsers

export function parseNumber(c: Cell): number | undefined | 'bad' {
  if (c === null || c === undefined) return undefined
  if (typeof c === 'number') return Number.isFinite(c) ? c : 'bad'
  const t = String(c).trim().replace(/[₹,\s]/g, '').replace(/%$/, '')
  if (t === '' || t === '-') return undefined
  const neg = /^\(.*\)$/.test(t)
  const n = Number(neg ? t.slice(1, -1) : t)
  return Number.isFinite(n) ? (neg ? -n : n) : 'bad'
}

const UNIT_MAP: Record<string, Unit> = {
  pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS', unit: 'PCS', each: 'PCS', ea: 'PCS',
  box: 'BOX', bx: 'BOX', carton: 'BOX', ctn: 'BOX', case: 'BOX',
  strip: 'STRIP', strips: 'STRIP', tab: 'STRIP', tabs: 'STRIP', tablet: 'STRIP', cap: 'STRIP',
  kg: 'KG', kgs: 'KG', kilo: 'KG', kilogram: 'KG',
  ltr: 'LTR', l: 'LTR', lt: 'LTR', litre: 'LTR', liter: 'LTR', ltrs: 'LTR',
  nos: 'NOS', no: 'NOS', number: 'NOS', numbers: 'NOS',
}
export function parseUnit(c: Cell): Unit | undefined {
  const t = norm(c)
  if (!t) return undefined
  const up = t.toUpperCase()
  return (UNITS as string[]).includes(up) ? (up as Unit) : UNIT_MAP[t]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** Accepts 08/27, 8/2027, Aug-27, 2027-08-31, Excel dates (Date or serial). Returns MM/YY, '' for blank, null if unreadable. */
export function parseExpiry(c: Cell): string | '' | null {
  if (c === null || c === undefined || c === '') return ''
  const mmyy = (m: number, y: number) => (m >= 1 && m <= 12 ? `${String(m).padStart(2, '0')}/${String(y % 100).padStart(2, '0')}` : null)
  if (c instanceof Date) return mmyy(c.getMonth() + 1, c.getFullYear())
  if (typeof c === 'number') {
    if (c > 20000 && c < 80000) { const d = new Date(Math.round((c - 25569) * 86400 * 1000)); return mmyy(d.getUTCMonth() + 1, d.getUTCFullYear()) } // Excel serial
    return null
  }
  const t = String(c).trim().toLowerCase()
  if (!t) return ''
  let m = /^(\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(t)
  if (m) return mmyy(Number(m[1]), m[2].length === 4 ? Number(m[2]) : 2000 + Number(m[2]))
  m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(t)
  if (m) return mmyy(Number(m[2]), Number(m[1]))
  m = /^([a-z]{3})[a-z]*[\s\-/.,]*(\d{2}|\d{4})$/.exec(t)
  if (m && MONTHS.includes(m[1])) return mmyy(MONTHS.indexOf(m[1]) + 1, m[2].length === 4 ? Number(m[2]) : 2000 + Number(m[2]))
  m = /^\d{1,2}[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(t) // dd/mm/yyyy
  if (m) return mmyy(Number(m[1]), m[2].length === 4 ? Number(m[2]) : 2000 + Number(m[2]))
  return null
}

// ---- preview

export type ItemData = Omit<Item, keyof Meta>
export type DuplicateMode = 'UPSERT' | 'SKIP'
export type StockMode = 'REPLACE' | 'ADD'
export interface ImportOptions { mode: DuplicateMode; stockMode: StockMode; /** false = non-GST business: new items default to 0% without a warning */ gstEnabled?: boolean }

export interface PreviewRow {
  /** 1-based row number in the sheet, for pointing at problems */
  line: number
  action: 'create' | 'update' | 'skip' | 'error'
  name: string
  code: string
  batch: string
  /** blocking text for error/skip, informational for others */
  note?: Msg
  warnings: Msg[]
  matchId?: string
  /** Fields to write. For updates, only fields present in the file. */
  data: Partial<ItemData>
  /** File's stock figure (create: opening stock). */
  stock?: number
  /** Net change to current stock after applying the stock mode (updates). */
  stockDelta?: number
}

export function buildPreview(rows: Cell[][], headerRow: number, map: Mapping, existing: Item[], opts: ImportOptions): PreviewRow[] {
  const out: PreviewRow[] = []
  const get = (r: Cell[], k: FieldKey): Cell => (map[k] >= 0 ? r[map[k]] : undefined)
  const byCode = new Map(existing.map((i) => [i.code.toLowerCase(), i]))
  const byNameBatch = new Map(existing.map((i) => [`${i.name.toLowerCase()}|${i.batchNo.toLowerCase()}`, i]))
  const taken = new Set(existing.map((i) => i.code))
  const items = new Map(existing.map((i) => [i.id, i]))
  // first row to claim each target (existing item id, or a key for a new one); later duplicates merge into it
  const claimed = new Map<string, PreviewRow>()
  const createdKeys = new Map<string, string>() // code or name|batch -> claim key
  let seq = 0
  // next free ITM-n; advanced incrementally so 5,000 new rows stay fast
  let codeSeq = parseInt(nextItemCode(existing.map((i) => i.code)).slice(4), 10)
  const freshCode = () => { while (taken.has(`ITM-${codeSeq}`)) codeSeq++; return `ITM-${codeSeq}` }

  rows.slice(headerRow + 1).forEach((r, idx) => {
    const line = headerRow + 2 + idx
    if (r.every((c) => text(c) === '')) return
    const name = text(get(r, 'name'))
    const warnings: Msg[] = []
    const base = { line, name, code: text(get(r, 'code')), batch: text(get(r, 'batchNo')), warnings }
    if (!name) { out.push({ ...base, action: 'error', note: { key: 'row.nameEmpty' }, data: {} }); return }
    if (/^(grand\s*)?total\b/i.test(name)) { out.push({ ...base, action: 'skip', note: { key: 'row.totals' }, data: {} }); return }

    // ---- parse every mapped field
    const data: Partial<ItemData> = { name }
    const num = (k: FieldKey, label: string) => {
      const v = parseNumber(get(r, k))
      if (v === 'bad') warnings.push({ key: 'warn.notNumber', params: { label, value: text(get(r, k)) } })
      return v === 'bad' ? undefined : v
    }
    const code = text(get(r, 'code'))
    if (code) data.code = code.toUpperCase()
    if (map.category >= 0 && text(get(r, 'category'))) data.category = text(get(r, 'category'))
    const hsn = text(get(r, 'hsn')).replace(/\.0+$/, '')
    if (hsn) { if (/^\d{4,8}$/.test(hsn)) data.hsn = hsn; else warnings.push({ key: 'warn.hsn', params: { value: hsn } }) }
    if (map.unit >= 0 && text(get(r, 'unit'))) {
      const u = parseUnit(get(r, 'unit'))
      if (u) data.unit = u; else warnings.push({ key: 'warn.unit', params: { value: text(get(r, 'unit')) } })
    }
    if (base.batch) data.batchNo = base.batch
    const ex = parseExpiry(get(r, 'expiry'))
    if (ex === null) warnings.push({ key: 'warn.expiry', params: { value: text(get(r, 'expiry')) } })
    else if (ex) data.expiry = ex
    const money = (k: 'mrp' | 'purchaseRate' | 'issueRate', label: string) => {
      const v = num(k, label)
      if (v === undefined) return
      if (v < 0) warnings.push({ key: 'warn.negative', params: { label } })
      else data[k] = toPaise(v)
    }
    money('mrp', 'mrp'); money('purchaseRate', 'purchaseRate'); money('issueRate', 'saleRate')
    let gst = num('gstPercent', 'gstPercent')
    if (gst !== undefined) {
      if (gst > 0 && gst < 1) gst = Math.round(gst * 100) // 0.18 stored as a fraction
      if ((GST_SLABS as readonly number[]).includes(gst)) data.gstPercent = gst
      else { warnings.push({ key: 'warn.gstSlab', params: { value: gst } }); gst = undefined }
    }
    const low = num('lowStockThreshold', 'lowStockAlert')
    if (low !== undefined && low >= 0) data.lowStockThreshold = low
    let stock = num('currentStock', 'stock')
    if (stock !== undefined && stock < 0) { warnings.push({ key: 'warn.stockNegative', params: { value: stock } }); stock = 0 }
    if (stock !== undefined) stock = roundQty(stock)

    // ---- match against existing items and earlier rows of this file
    const nb = `${name.toLowerCase()}|${base.batch.toLowerCase()}`
    const hit = (code && byCode.get(code.toLowerCase())) || byNameBatch.get(nb)
    const claimKey = hit ? hit.id : (code && createdKeys.get(code.toLowerCase())) || createdKeys.get(nb)

    if (claimKey) {
      const first = claimed.get(claimKey)
      if (first) { // second row for the same target
        if (opts.mode === 'SKIP') { out.push({ ...base, action: 'skip', note: { key: 'note.duplicateOf', params: { row: first.line } }, data: {} }); return }
        Object.assign(first.data, data)
        if (stock !== undefined) {
          first.stock = opts.stockMode === 'ADD' ? roundQty((first.stock ?? 0) + stock) : stock
          if (first.action === 'update') first.stockDelta = opts.stockMode === 'ADD' ? roundQty((first.stockDelta ?? 0) + stock) : roundQty(stock - (items.get(first.matchId!)?.currentStock ?? 0))
        }
        first.warnings.push({ key: 'warn.merged', params: { row: line } })
        out.push({ ...base, action: 'skip', note: { key: 'note.mergedInto', params: { row: first.line } }, data: {} })
        return
      }
      if (hit) {
        if (opts.mode === 'SKIP') { out.push({ ...base, code: hit.code, action: 'skip', note: { key: 'note.exists' }, data: {} }); return }
        const row: PreviewRow = { ...base, code: hit.code, action: 'update', matchId: hit.id, data, stock }
        if (stock !== undefined) row.stockDelta = opts.stockMode === 'ADD' ? stock : roundQty(stock - hit.currentStock)
        claimed.set(hit.id, row); out.push(row)
        return
      }
    }

    // ---- new item
    let finalCode = data.code ?? ''
    if (!finalCode || taken.has(finalCode)) {
      if (finalCode) warnings.push({ key: 'warn.codeTaken', params: { code: finalCode } })
      finalCode = freshCode()
    }
    taken.add(finalCode)
    const mrp = data.mrp ?? 0
    if (data.issueRate === undefined) {
      if (mrp > 0) { data.issueRate = mrp; warnings.push({ key: 'warn.rateFromMrp' }) } else { data.issueRate = 0; warnings.push({ key: 'warn.rateZero' }) }
    }
    if (data.gstPercent === undefined) {
      if (opts.gstEnabled === false) data.gstPercent = 0
      else { data.gstPercent = 12; warnings.push({ key: 'warn.gstMissing' }) }
    }
    const full: Partial<ItemData> = {
      category: '', hsn: '', unit: 'PCS', batchNo: '', expiry: '', mrp: 0, purchaseRate: 0, lowStockThreshold: 10, ...data, code: finalCode,
    }
    const row: PreviewRow = { ...base, code: finalCode, action: 'create', data: full, stock: stock ?? 0 }
    const key = `new:${seq++}`
    claimed.set(key, row)
    createdKeys.set(finalCode.toLowerCase(), key); createdKeys.set(nb, key)
    out.push(row)
  })
  return out
}

export const SAMPLE_CSV = [
  'Stock & Sales Report - Closing Stock',
  'Shree Ganesh Traders    As on 19-11-2026',
  'Item Name,Pack,Company,HSN,Batch,Exp,MRP,P.Rate,S.Rate,GST%,Cl.Stock',
  'Paracetamol 500mg Tab,10x10,Cipla,30049099,PCM2411,08/27,28.50,17.00,23.00,12,240',
  'Azithromycin 500mg Tab,1x3,Zydus,30042099,AZ50331,11/26,118.00,71.00,96.00,12,8',
  'Surf Excel Easy Wash 1kg,1kg,HUL,34022090,,,135.00,98.00,118.00,18,120',
  'Tata Salt 1kg,1kg,Tata Consumer,25010020,,,28.00,21.00,25.00,0,500',
  'Gel Pen Blue (Box of 10),Box,Reynolds,96081019,,,100.00,62.00,85.00,12,55',
  'Total,,,,,,,,,,923',
].join('\n')
