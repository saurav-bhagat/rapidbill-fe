import { describe, expect, it } from 'vitest'
import type { Party } from '@/services/types'
import { autoMapParties, buildPartyPreview, detectHeaderRow, parseBalance, parseState, parseType, SAMPLE_PARTIES_CSV, type Cell, type PartyImportOptions } from './partyImporter'
import { partiesToRows } from './exportParties'

const opts = (over: Partial<PartyImportOptions> = {}): PartyImportOptions => ({ mode: 'UPSERT', updateBalance: false, defaultState: '29', ...over })
const party = (name: string, over: Partial<Party> = {}): Party => ({ id: `id-${name}`, workspaceId: 'w', createdBy: 'u', createdAt: 't', updatedAt: 't', name, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0, ...over })
const run = (rows: Cell[][], existing: Party[] = [], o = opts()) => {
  const h = detectHeaderRow(rows)
  return buildPartyPreview(rows, h, autoMapParties(rows[h]!), existing, o)
}
const HEAD = ['Party Name', 'Type', 'GSTIN', 'State', 'Mobile', 'Address', 'Opening Balance']

describe('reading a party spreadsheet', () => {
  it('finds the header row below report titles and matches the columns by their usual names', () => {
    const rows: Cell[][] = [['Customer list'], ['Shree Traders', '', '', 'as on 19-11-2026'], ['Ledger Name', 'Mobile No.', 'GST No', 'State Name', 'Outstanding'], ['A', '1', '', '', '']]
    expect(detectHeaderRow(rows)).toBe(2)
    expect(autoMapParties(rows[2]!)).toEqual({ name: 0, type: -1, gstin: 2, state: 3, phone: 1, address: -1, balance: 4 })
  })

  it('the sample file previews cleanly', () => {
    const rows = SAMPLE_PARTIES_CSV.split('\n').map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '')).slice(0, 7))
    const out = run(rows)
    expect(out.map((r) => r.action)).toEqual(['create', 'create', 'create', 'create', 'create'])
    expect(out[0]!.data).toMatchObject({ name: 'Sharma Medical Stores', type: 'CUSTOMER', stateCode: '29', balance: 1250000 })
    expect(out[2]!.data).toMatchObject({ type: 'BRANCH', stateCode: '36' })
    expect(out[3]!.data).toMatchObject({ type: 'DEPARTMENT' })
  })
})

describe('cell readers', () => {
  it('balances: plain, brackets, Dr and Cr, rupee signs, bad text', () => {
    expect(parseBalance('1,250.50')).toBe(125050)
    expect(parseBalance('₹ 300')).toBe(30000)
    expect(parseBalance('(300)')).toBe(-30000)
    expect(parseBalance('1250 Dr')).toBe(125000)
    expect(parseBalance('1250 Cr')).toBe(-125000)
    expect(parseBalance(99.99)).toBe(9999)
    expect(parseBalance('')).toBeUndefined()
    expect(parseBalance('abc')).toBe('bad')
  })
  it('states: code, name, spelling, "29 - Karnataka", short form; unknown is undefined', () => {
    expect(parseState('29')).toBe('29')
    expect(parseState(7)).toBe('07')
    expect(parseState(' karnataka ')).toBe('29')
    expect(parseState('Jammu & Kashmir')).toBe('01')
    expect(parseState('Orissa')).toBe('21')
    expect(parseState('29 - Karnataka')).toBe('29')
    expect(parseState('MH')).toBe('27')
    expect(parseState('Atlantis')).toBeUndefined()
    expect(parseState('99')).toBeUndefined()
  })
  it('types', () => {
    expect(parseType('Sundry Debtors')).toBe('CUSTOMER')
    expect(parseType('DEPT')).toBe('DEPARTMENT')
    expect(parseType('Branch')).toBe('BRANCH')
    expect(parseType('whatever')).toBeUndefined()
  })
})

describe('checking every row', () => {
  it('new parties get every field, with the business state when the file has none', () => {
    const [r] = run([HEAD, ['Acme', '', '', '', '', '', '']])
    expect(r).toMatchObject({ action: 'create', data: { name: 'Acme', type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0 } })
    expect(r!.warnings.map((w) => w.key)).toEqual(['warn.stateDefault'])
  })

  it('the GSTIN decides the state, and a file state that disagrees is called out', () => {
    const [r] = run([HEAD, ['Mumbai Co', '', '27AAFFM7743K1ZU', 'Karnataka', '', '', '']])
    expect(r!.data).toMatchObject({ gstin: '27AAFFM7743K1ZU', stateCode: '27' })
    expect(r!.warnings.map((w) => w.key)).toContain('warn.stateFromGstin')
  })

  it('a GSTIN that is not valid is left blank with a warning, and the party is still added', () => {
    const [r] = run([HEAD, ['Bad Gst', '', '12345', 'Kerala', '', '', '']])
    expect(r).toMatchObject({ action: 'create', data: { gstin: '', stateCode: '32' } })
    expect(r!.warnings.map((w) => w.key)).toContain('warn.gstin')
  })

  it('a wrong check digit is kept but flagged', () => {
    const [r] = run([HEAD, ['Typo Co', '', '29AABCA1234F1Z6', '', '', '', '']])
    expect(r!.data.gstin).toBe('29AABCA1234F1Z6')
    expect(r!.warnings.map((w) => w.key)).toContain('warn.gstinCheck')
  })

  it('phones typed as numbers, long phones, multi-line addresses', () => {
    const [r] = run([HEAD, ['Phone Co', '', '', '29', 9876543210, 'Line one\nLine two', '']])
    expect(r!.data).toMatchObject({ phone: '9876543210', address: 'Line one, Line two' })
    const [long] = run([HEAD, ['Long Co', '', '', '29', '98765 43210 98765 43210 9999', '', '']])
    expect(long!.data.phone!.length).toBeLessThanOrEqual(20)
    expect(long!.warnings.map((w) => w.key)).toContain('warn.phoneLong')
  })

  it('opening balance of a new party comes from the file, Dr/Cr aware', () => {
    const out = run([HEAD, ['Owes', '', '', '29', '', '', '500 Dr'], ['Owed', '', '', '29', '', '', '200 Cr']])
    expect(out.map((r) => r.data.balance)).toEqual([50000, -20000])
  })

  it('errors and skips: no name, a totals row, blank rows, a repeated name', () => {
    const out = run([HEAD, ['', '', '', '29', '', '', ''], ['Total', '', '', '', '', '', '900'], [], ['Same', '', '', '29', '', '', ''], ['same ', '', '', '29', '', '', '']])
    expect(out.map((r) => [r.line, r.action, r.note?.key])).toEqual([[2, 'error', 'row.nameEmpty'], [3, 'skip', 'row.totals'], [5, 'create', undefined], [6, 'skip', 'note.duplicateOf']])
    expect(out[3]!.note!.params).toEqual({ row: 5 })
  })

  it('an existing party is updated with only what the file has, and keeps its spelling and its balance', () => {
    const existing = [party('Apollo Pharmacy', { balance: 99900, phone: '111', address: 'Old' })]
    const [r] = run([HEAD, ['APOLLO pharmacy', '', '', '', '222', '', '5000']], existing)
    expect(r).toMatchObject({ action: 'update', matchId: 'id-Apollo Pharmacy', data: { phone: '222' } })
    expect(r!.data).not.toHaveProperty('name')
    expect(r!.data).not.toHaveProperty('balance')
    expect(r!.warnings.map((w) => w.key)).toContain('warn.balanceKept')
  })

  it('"also change balances" does exactly that', () => {
    const existing = [party('Apollo Pharmacy', { balance: 99900 })]
    const [r] = run([HEAD, ['Apollo Pharmacy', '', '', '', '', '', '5000']], existing, opts({ updateBalance: true }))
    expect(r!.data.balance).toBe(500000)
  })

  it('an update with a GSTIN also carries the state, so the server never sees a mismatch', () => {
    const existing = [party('Old Co', { stateCode: '29' })]
    const [r] = run([HEAD, ['Old Co', '', '27AAFFM7743K1ZU', '', '', '', '']], existing)
    expect(r!.data).toMatchObject({ gstin: '27AAFFM7743K1ZU', stateCode: '27' })
  })

  it('"skip existing" leaves them alone', () => {
    const [r] = run([HEAD, ['Apollo Pharmacy', '', '', '', '222', '', '']], [party('Apollo Pharmacy')], opts({ mode: 'SKIP' }))
    expect(r).toMatchObject({ action: 'skip', note: { key: 'note.exists' } })
  })

  it('a thousand rows are quick', () => {
    const rows: Cell[][] = [HEAD, ...Array.from({ length: 5000 }, (_, i) => [`Party ${i}`, '', '', '29', String(9000000000 + i), '', i])]
    const t0 = Date.now()
    expect(run(rows)).toHaveLength(5000)
    expect(Date.now() - t0).toBeLessThan(1500)
  })
})

describe('export', () => {
  it('uses column names the importer reads back', () => {
    const rows = partiesToRows([party('Zed Co', { type: 'BRANCH', gstin: '29AABCA1234F1Z5', phone: '1', address: 'A', balance: 12345 })])
    expect(Object.keys(rows[0]!)).toEqual(['Party Name', 'Type', 'GSTIN', 'State Code', 'Mobile', 'Address', 'Opening Balance'])
    const header = Object.keys(rows[0]!)
    const map = autoMapParties(header)
    expect(Object.values(map).every((c) => c >= 0)).toBe(true)
    const back = buildPartyPreview([header, Object.values(rows[0]!)], 0, map, [], opts())
    expect(back[0]!.data).toMatchObject({ name: 'Zed Co', type: 'BRANCH', gstin: '29AABCA1234F1Z5', stateCode: '29', balance: 12345 })
  })
})
