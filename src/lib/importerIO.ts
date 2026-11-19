import { AppError } from '@/services/errors'
import type { Cell, Sheet } from './importer'

export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_ROWS = 50_000

/** Read .csv / .xlsx / .xls in the browser. SheetJS is loaded only when a file is chosen. */
export async function readWorkbook(file: File): Promise<Sheet[]> {
  if (file.size > MAX_BYTES) throw new AppError('fileTooBig')
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error('Choose a .csv, .xlsx or .xls file.')
  const buf = await file.arrayBuffer()
  // .xlsx is a zip archive. Reject anything else up front instead of reading binary junk as text.
  if (/\.xlsx$/i.test(file.name) && !(new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 0, 2)[1] === 0x4b)) {
    throw new AppError('notXlsx')
  }
  const XLSX = await import('xlsx')
  let wb
  try {
    // CSV: keep every cell as typed text. Otherwise SheetJS turns an expiry like "08/27" into a date (27 Aug 2001).
    wb = XLSX.read(buf, /\.csv$/i.test(file.name) ? { type: 'array', raw: true } : { type: 'array', cellDates: true })
  } catch {
    throw new AppError('fileUnreadable')
  }
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true }),
  })).filter((s) => s.rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')).length >= 2) // titles + at least one data row
  if (sheets.length === 0) throw new AppError('noSheet')
  if (sheets.some((s) => s.rows.length > MAX_ROWS)) throw new AppError('tooManyRows', { limit: MAX_ROWS.toLocaleString('en-IN') })
  return sheets
}

export const colLetter = (i: number): string => {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}
