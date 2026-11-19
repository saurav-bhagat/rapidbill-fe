import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { readWorkbook } from './importerIO'
import { autoMap, buildPreview, detectHeaderRow } from './importer'
import { buildSeed } from '@/services/seed'

const seed = buildSeed().items

/** Build a real workbook in memory and wrap it as a browser File. */
function makeFile(name: string, book: XLSX.WorkBook, bookType: XLSX.BookType): File {
  const buf = XLSX.write(book, { bookType, type: 'array' }) as ArrayBuffer
  return new File([buf], name)
}
const HEAD = ['Item Name', 'Company', 'HSN', 'Batch', 'Exp', 'MRP', 'P.Rate', 'S.Rate', 'GST%', 'Cl.Stock']

function marg(extra: unknown[][] = []): XLSX.WorkBook {
  const aoa = [
    ['Stock & Sales Report - Closing Stock'], ['Shree Ganesh Traders'], HEAD,
    ['Paracetamol 500mg Tab', 'Cipla', 30049099, 'PCM2411', '08/27', 28.5, 17, 24, 12, 300], // text expiry, numeric HSN
    ['Fresh Item A', 'Acme', '30049099', 'FA1', new Date(Date.UTC(2028, 7, 15)), '₹150.00', 90, '', 0.05, 40], // real date, currency text, GST as fraction
    ['Fresh Item B', 'Acme', '', '', 46630, 10, 5, 8, 18, '(3)'], // Excel serial expiry, accounting negative
    ['Total', '', '', '', '', '', '', '', '', 337],
    ...extra,
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Closing Stock')
  return wb
}

describe.each([['xlsx', 'xlsx'], ['xls', 'biff8'], ['csv', 'csv']] as const)('import from .%s', (ext, bookType) => {
  it('reads, finds headers, maps and previews correctly', async () => {
    const sheets = await readWorkbook(makeFile(`marg.${ext}`, marg(), bookType as XLSX.BookType))
    expect(sheets).toHaveLength(1)
    const rows = sheets[0].rows
    const h = detectHeaderRow(rows)
    expect(h).toBe(2)
    const map = autoMap(rows[h])
    expect(map.name).toBe(0); expect(map.currentStock).toBe(9); expect(map.expiry).toBe(4)
    const p = buildPreview(rows, h, map, seed, { mode: 'UPSERT', stockMode: 'REPLACE' })
    const by = (n: string) => p.find((r) => r.name.startsWith(n))!
    const para = by('Paracetamol')
    expect(para.action).toBe('update')
    expect(para.data.issueRate).toBe(2400)
    expect(para.stock).toBe(300)
    const a = by('Fresh Item A')
    expect(a.action).toBe('create')
    expect(a.data.mrp).toBe(15000)
    expect(a.data.issueRate).toBe(15000) // no sale rate -> MRP, with warning
    expect(a.warnings.map((w) => w.key)).toContain('warn.rateFromMrp')
    expect(a.data.gstPercent).toBe(5) // 0.05 fraction
    expect(a.stock).toBe(40)
    const b = by('Fresh Item B')
    expect(b.stock).toBe(0) // (3) accounting negative -> clamped with warning
    expect(b.warnings.map((w) => w.key)).toContain('warn.stockNegative')
    expect(by('Total').action).toBe('skip')
  })
})

describe('xlsx specifics', () => {
  it('expiry as Excel date, as serial and as text all give MM/YY', async () => {
    const p = async (bookType: XLSX.BookType) => {
      const sheets = await readWorkbook(makeFile('m.' + bookType, marg(), bookType))
      const rows = sheets[0].rows
      return buildPreview(rows, 2, autoMap(rows[2]), seed, { mode: 'UPSERT', stockMode: 'REPLACE' })
    }
    const x = await p('xlsx')
    expect(x.find((r) => r.name === 'Fresh Item A')!.data.expiry).toBe('08/28') // Date cell
    expect(x.find((r) => r.name === 'Fresh Item B')!.data.expiry).toBe('08/27') // serial 46630
    expect(x.find((r) => r.name.startsWith('Paracetamol'))!.data.expiry).toBe('08/27') // text
  })

  it('lists every non-empty sheet and ignores blank ones', async () => {
    const wb = marg()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Item Name', 'MRP'], ['Second Sheet Item', 50]]), 'Other')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty')
    const sheets = await readWorkbook(makeFile('multi.xlsx', wb, 'xlsx'))
    expect(sheets.map((s) => s.name)).toEqual(['Closing Stock', 'Other'])
    expect(buildPreview(sheets[1].rows, 0, autoMap(sheets[1].rows[0]), seed, { mode: 'UPSERT', stockMode: 'REPLACE' })[0].name).toBe('Second Sheet Item')
  })

  it('works when headers are in row 1 with no title lines', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Product', 'Closing Qty', 'Selling Price'], ['Lamp', 5, 99]]), 'S')
    const [s] = await readWorkbook(makeFile('p.xlsx', wb, 'xlsx'))
    expect(detectHeaderRow(s.rows)).toBe(0)
    const m = autoMap(s.rows[0])
    expect([m.name, m.currentStock, m.issueRate]).toEqual([0, 1, 2])
  })

  it('exports from RapidBill and re-imports as pure updates (round trip)', async () => {
    const { itemsToRows } = await import('./exportItems')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsToRows(seed)), 'Inventory')
    const [s] = await readWorkbook(makeFile('rt.xlsx', wb, 'xlsx'))
    const map = autoMap(s.rows[0])
    const p = buildPreview(s.rows, 0, map, seed, { mode: 'UPSERT', stockMode: 'REPLACE' })
    expect(p).toHaveLength(seed.length)
    expect(p.every((r) => r.action === 'update')).toBe(true)
    expect(p.every((r) => !r.stockDelta)).toBe(true) // nothing changed
    expect(p.flatMap((r) => r.warnings)).toEqual([])
  })

  it('reads a ".xls" that is really an HTML table (common from legacy ERP exports)', async () => {
    const html = '<html><body><table><tr><td>Particulars</td><td>Cl.Qty</td><td>Rate</td></tr><tr><td>Lamp</td><td>5</td><td>99</td></tr></table></body></html>'
    const [s] = await readWorkbook(new File([html], 'export.xls'))
    const m = autoMap(s.rows[0])
    expect([m.name, m.currentStock, m.issueRate]).toEqual([0, 1, 2])
    expect(buildPreview(s.rows, 0, m, seed, { mode: 'UPSERT', stockMode: 'REPLACE' })[0]).toMatchObject({ name: 'Lamp', action: 'create', stock: 5 })
  })

  it('rejects wrong types and empty or broken files', async () => {
    await expect(readWorkbook(new File(['x'], 'notes.txt'))).rejects.toThrow(/\.csv, \.xlsx or \.xls/)
    await expect(readWorkbook(new File([''], 'empty.csv'))).rejects.toThrow(/header row/i)
    await expect(readWorkbook(new File([new Uint8Array([1, 2, 3, 4])], 'bad.xlsx'))).rejects.toThrow(/not a valid \.xlsx/)
    await expect(readWorkbook(new File([new Uint8Array([1, 2, 3, 4])], 'bad.xls'))).rejects.toThrow()
    await expect(readWorkbook(new File(['Item Name,MRP'], 'headers-only.csv'))).rejects.toThrow(/header row/i)
  })
})
