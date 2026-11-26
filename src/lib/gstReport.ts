import { stateName } from './gst'

/**
 * The GST report the server works out (rapidbill-be/src/domain/gstReport.ts), and the Excel workbook made from it for the accountant.
 * The sheets and headers follow the GST offline tool's GSTR-1 Excel template, so it can be imported there (the tool makes the JSON the
 * portal takes). Same file in the web app (src/lib) and the phone app (src/core): keep them identical.
 */
export interface Tax { taxable: number; igst: number; cgst: number; sgst: number }
export interface RateRow extends Tax { rate: number }
export interface InvoiceRow { id: string; number: string; date: string; value: number; pos: string; rates: RateRow[] }
export interface B2bRow extends InvoiceRow { ctin: string; name: string }
export interface NoteRow { id: string; number: string; date: string; invoiceNo: string; invoiceDate: string; value: number; pos: string; rates: RateRow[] }
export interface CdnrRow extends NoteRow { ctin: string; name: string }
export interface CdnurRow extends NoteRow { urType: 'B2CL' }
export interface B2csRow extends Tax { pos: string; type: 'INTRA' | 'INTER'; rate: number }
export interface HsnRow extends Tax { hsn: string; description: string; uqc: string; qty: number; value: number; rate: number }
export interface DocRow { kind: 'INVOICE' | 'CREDIT_NOTE'; series: string; from: string; to: string; total: number; cancelled: number }
export interface NilRow { interReg: number; intraReg: number; interUnreg: number; intraUnreg: number }
export interface RegisterRow extends Tax { id: string; number: string; date: string; party: string; gstin: string; pos: string; total: number; status: 'ACTIVE' | 'CANCELLED'; against?: string }
export type GstNoteKey = 'noSellerGstin' | 'nonGst' | 'challansLeftOut' | 'untaxedLeftOut' | 'b2bNoHsn' | 'b2csNegative' | 'customNumbers' | 'hsnBlank' | 'hsnNegative'
export interface GstReport {
  from: string
  to: string
  seller: { name: string; gstin: string; stateCode: string }
  b2b: B2bRow[]
  b2cl: InvoiceRow[]
  b2cs: B2csRow[]
  cdnr: CdnrRow[]
  cdnur: CdnurRow[]
  nil: NilRow
  hsn: { b2b: HsnRow[]; b2c: HsnRow[] }
  docs: DocRow[]
  gstr3b: { outward: Tax; nil: number; interUnreg: { pos: string; taxable: number; igst: number }[] }
  counts: { invoices: number; cancelled: number; creditNotes: number; cancelledNotes: number }
  register: { bills: RegisterRow[]; creditNotes: RegisterRow[] }
  notes: { key: GstNoteKey; count?: number }[]
}

export type Cell = string | number
export interface Sheet { name: string; rows: Cell[][] }

/** Rupees with paise, as a number (the offline tool wants numbers, not text). */
const rs = (p: number) => Math.round(p) / 100
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 10-Nov-2026: the date format of the offline tool's template. */
export const gstDate = (iso: string) => `${iso.slice(8, 10)}-${MON[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`
/** 29-Karnataka: the place-of-supply format of the template. */
export const posText = (code: string) => (code ? `${code}-${stateName(code)}` : '')

const UQC_NAME: Record<string, string> = {
  PCS: 'PIECES', BOX: 'BOX', KGS: 'KILOGRAMS', LTR: 'LITRES', NOS: 'NUMBERS', GMS: 'GRAMMES', MLT: 'MILILITRE', MTR: 'METERS', SQF: 'SQUARE FEET',
  DOZ: 'DOZENS', PAC: 'PACKS', BAG: 'BAGS', ROL: 'ROLLS', SET: 'SETS', PRS: 'PAIRS', TON: 'TONNES', QTL: 'QUINTAL', OTH: 'OTHERS',
}
export const uqcText = (u: string) => `${u}-${UQC_NAME[u] ?? 'OTHERS'}`

/** The workbook: GSTR-1 sheets in the template's order and headers, then a GSTR-3B summary, the registers and the notes. */
export function gstSheets(r: GstReport, noteText: (n: GstReport['notes'][number]) => string): Sheet[] {
  const hsnHead = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount']
  const hsnRows = (xs: GstReport['hsn']['b2b']) => xs.map((h) => [h.hsn, h.description, uqcText(h.uqc), h.qty, rs(h.value), h.rate, rs(h.taxable), rs(h.igst), rs(h.cgst), rs(h.sgst), 0])
  const reg = (xs: RegisterRow[], notes: boolean) => [
    ['Number', 'Date', ...(notes ? ['Against bill'] : []), 'Party', 'GSTIN', 'Place Of Supply', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total', 'Status'],
    ...xs.map((x) => [x.number, gstDate(x.date), ...(notes ? [x.against ?? ''] : []), x.party, x.gstin, posText(x.pos), rs(x.taxable), rs(x.cgst), rs(x.sgst), rs(x.igst), rs(x.total), x.status === 'CANCELLED' ? 'Cancelled' : '']),
  ]
  const o = r.gstr3b.outward
  return [
    { name: 'b2b,sez,de', rows: [
      ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'],
      ...r.b2b.flatMap((x) => x.rates.map((t) => [x.ctin, x.name, x.number, gstDate(x.date), rs(x.value), posText(x.pos), 'N', '', 'Regular B2B', '', t.rate, rs(t.taxable), 0])),
    ] },
    { name: 'b2cl', rows: [
      ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
      ...r.b2cl.flatMap((x) => x.rates.map((t) => [x.number, gstDate(x.date), rs(x.value), posText(x.pos), '', t.rate, rs(t.taxable), 0, ''])),
    ] },
    { name: 'b2cs', rows: [
      ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
      ...r.b2cs.map((x) => ['OE', posText(x.pos), '', x.rate, rs(x.taxable), 0, '']),
    ] },
    { name: 'cdnr', rows: [
      ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
      ...r.cdnr.flatMap((x) => x.rates.map((t) => [x.ctin, x.name, x.number, gstDate(x.date), 'C', posText(x.pos), 'N', 'Regular B2B', rs(x.value), '', t.rate, rs(t.taxable), 0])),
    ] },
    { name: 'cdnur', rows: [
      ['UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
      ...r.cdnur.flatMap((x) => x.rates.map((t) => [x.urType, x.number, gstDate(x.date), 'C', posText(x.pos), rs(x.value), '', t.rate, rs(t.taxable), 0])),
    ] },
    { name: 'exemp', rows: [
      ['Description', 'Nil Rated Supplies', 'Exempted(other than nil rated/non GST supply)', 'Non-GST Supplies'],
      ['Inter-State supplies to registered persons', rs(r.nil.interReg), 0, 0],
      ['Intra-State supplies to registered persons', rs(r.nil.intraReg), 0, 0],
      ['Inter-State supplies to unregistered persons', rs(r.nil.interUnreg), 0, 0],
      ['Intra-State supplies to unregistered persons', rs(r.nil.intraUnreg), 0, 0],
    ] },
    { name: 'hsn(b2b)', rows: [hsnHead, ...hsnRows(r.hsn.b2b)] },
    { name: 'hsn(b2c)', rows: [hsnHead, ...hsnRows(r.hsn.b2c)] },
    { name: 'docs', rows: [
      ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
      ...r.docs.map((d) => [d.kind === 'INVOICE' ? 'Invoices for outward supply' : 'Credit Note', d.from, d.to, d.total, d.cancelled]),
    ] },
    { name: 'GSTR-3B', rows: [
      ['GSTR-3B (outward supplies only; input tax credit is not in RapidBill)', '', '', '', ''],
      ['', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax'],
      ['3.1(a) Outward taxable supplies (net of credit notes)', rs(o.taxable), rs(o.igst), rs(o.cgst), rs(o.sgst)],
      ['3.1(c) Nil rated and exempted', rs(r.gstr3b.nil), '', '', ''],
      [],
      ['3.2 Inter-State supplies to unregistered persons', 'Place Of Supply', 'Taxable Value', 'Integrated Tax', ''],
      ...r.gstr3b.interUnreg.map((u) => ['', posText(u.pos), rs(u.taxable), rs(u.igst), '']),
    ] },
    { name: 'Sales register', rows: reg(r.register.bills, false) },
    { name: 'Credit notes', rows: reg(r.register.creditNotes, true) },
    { name: 'Notes', rows: [
      ['Business', r.seller.name], ['GSTIN', r.seller.gstin], ['Period', `${gstDate(r.from)} to ${gstDate(r.to)}`], [],
      ...(r.notes.length ? r.notes.map((n) => [noteText(n)]) : [['Nothing to check.']]),
    ] },
  ]
}

/** The file name the accountant sees: GSTR1-29AAKFS4821M1ZM-2026-11-01-to-2026-11-30.xlsx */
export const gstFileName = (r: Pick<GstReport, 'from' | 'to' | 'seller'>) => `GSTR1-${r.seller.gstin || 'no-gstin'}-${r.from}-to-${r.to}.xlsx`

/** The filing periods a shop picks from: this and last month, this and last quarter (April to March year). */
export function periodOf(kind: 'month' | 'lastMonth' | 'quarter' | 'lastQuarter', today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  const end = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`
  const start = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`
  if (kind === 'month') return { from: start(y, m), to: end(y, m) }
  if (kind === 'lastMonth') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { from: start(yy, mm), to: end(yy, mm) } }
  // quarters of the financial year: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar
  const qStart = (mm: number) => (mm >= 4 ? Math.floor((mm - 4) / 3) * 3 + 4 : 1)
  let qs = qStart(m), qy = y
  if (kind === 'lastQuarter') { qs -= 3; if (qs < 1) { qs = 10; qy = y - 1 } }
  return { from: start(qy, qs), to: end(qy, qs + 2) }
}
