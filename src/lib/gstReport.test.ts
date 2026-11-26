import { describe, expect, it } from 'vitest'
import { gstDate, gstFileName, gstSheets, periodOf, posText, uqcText, type GstReport } from './gstReport'

const tax = { taxable: 0, igst: 0, cgst: 0, sgst: 0 }
const report: GstReport = {
  from: '2026-11-01', to: '2026-11-30', seller: { name: 'Shop', gstin: '29AAKFS4821M1ZM', stateCode: '29' },
  b2b: [{ id: 'v1', number: 'SI-2627-0001', date: '2026-11-10', value: 22400, pos: '27', ctin: '27AAFFM7743K1ZU', name: 'Mehta', rates: [{ rate: 12, ...tax, taxable: 20000, igst: 2400 }] }],
  b2cl: [], b2cs: [{ pos: '29', type: 'INTRA', rate: 18, ...tax, taxable: 11800, cgst: 1062, sgst: 1062 }],
  cdnr: [{ id: 'r1', number: 'CN-2627-0001', date: '2026-11-20', invoiceNo: 'SI-2627-0001', invoiceDate: '2026-11-10', value: 11200, pos: '27', ctin: '27AAFFM7743K1ZU', name: 'Mehta', rates: [{ rate: 12, ...tax, taxable: 10000, igst: 1200 }] }],
  cdnur: [], nil: { interReg: 0, intraReg: 0, interUnreg: 0, intraUnreg: 7500 },
  hsn: { b2b: [{ hsn: '30049099', description: 'Paracetamol', uqc: 'PCS', qty: 1, value: 11200, rate: 12, ...tax, taxable: 10000, igst: 1200 }], b2c: [] },
  docs: [{ kind: 'INVOICE', series: 'SI-2627', from: 'SI-2627-0001', to: 'SI-2627-0009', total: 9, cancelled: 1 }],
  gstr3b: { outward: { taxable: 21800, igst: 1200, cgst: 1062, sgst: 1062 }, nil: 7500, interUnreg: [] },
  counts: { invoices: 8, cancelled: 1, creditNotes: 1, cancelledNotes: 0 },
  register: { bills: [], creditNotes: [] }, notes: [{ key: 'b2bNoHsn', count: 2 }],
}
const sheet = (name: string) => gstSheets(report, (n) => `${n.key}:${n.count}`).find((s) => s.name === name)!.rows

describe('the GSTR-1 workbook for the accountant', () => {
  it('has the offline tool\'s sheets in its order', () => {
    expect(gstSheets(report, () => '').map((s) => s.name)).toEqual(['b2b,sez,de', 'b2cl', 'b2cs', 'cdnr', 'cdnur', 'exemp', 'hsn(b2b)', 'hsn(b2c)', 'docs', 'GSTR-3B', 'Sales register', 'Credit notes', 'Notes'])
  })
  it('writes one B2B row per rate, with rupees, the template date and place of supply formats', () => {
    expect(sheet('b2b,sez,de')[1]).toEqual(['27AAFFM7743K1ZU', 'Mehta', 'SI-2627-0001', '10-Nov-2026', 224, '27-Maharashtra', 'N', '', 'Regular B2B', '', 12, 200, 0])
  })
  it('writes B2CS as OE rows, credit notes as type C, nil rated in its four rows, HSN with the unit name, and documents', () => {
    expect(sheet('b2cs')[1]).toEqual(['OE', '29-Karnataka', '', 18, 118, 0, ''])
    expect(sheet('cdnr')[1]).toEqual(['27AAFFM7743K1ZU', 'Mehta', 'CN-2627-0001', '20-Nov-2026', 'C', '27-Maharashtra', 'N', 'Regular B2B', 112, '', 12, 100, 0])
    expect(sheet('exemp')[4]).toEqual(['Intra-State supplies to unregistered persons', 75, 0, 0])
    expect(sheet('hsn(b2b)')[1]).toEqual(['30049099', 'Paracetamol', 'PCS-PIECES', 1, 112, 12, 100, 12, 0, 0, 0])
    expect(sheet('docs')[1]).toEqual(['Invoices for outward supply', 'SI-2627-0001', 'SI-2627-0009', 9, 1])
    expect(sheet('Notes').at(-1)).toEqual(['b2bNoHsn:2'])
  })
  it('formats dates, states, units and the file name', () => {
    expect(gstDate('2027-03-05')).toBe('05-Mar-2027')
    expect(posText('07')).toBe('07-Delhi')
    expect(uqcText('OTH')).toBe('OTH-OTHERS')
    expect(gstFileName(report)).toBe('GSTR1-29AAKFS4821M1ZM-2026-11-01-to-2026-11-30.xlsx')
  })
})

describe('filing periods', () => {
  it('months, including January going back to December', () => {
    expect(periodOf('month', '2026-11-25')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodOf('lastMonth', '2026-11-25')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodOf('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodOf('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('quarters of the April-March year', () => {
    expect(periodOf('quarter', '2026-11-25')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(periodOf('lastQuarter', '2026-11-25')).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(periodOf('quarter', '2027-02-01')).toEqual({ from: '2027-01-01', to: '2027-03-31' })
    expect(periodOf('lastQuarter', '2027-02-01')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(periodOf('lastQuarter', '2026-05-01')).toEqual({ from: '2026-01-01', to: '2026-03-31' })
    expect(periodOf('quarter', '2026-04-01')).toEqual({ from: '2026-04-01', to: '2026-06-30' })
  })
})
