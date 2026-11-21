import { checkGstin, STATES } from './gst'
import { toPaise } from './money'
import type { Msg } from './itemForm'
import type { Party, Meta, PartyType } from '@/services/types'

export type Cell = string | number | boolean | Date | null | undefined
export interface Sheet { name: string; rows: Cell[][] }
export type PartyData = Omit<Party, keyof Meta>
export type PartyFieldKey = 'name' | 'type' | 'gstin' | 'state' | 'phone' | 'address' | 'balance'
export const PARTY_FIELDS: { key: PartyFieldKey; required?: boolean }[] = [
  { key: 'name', required: true }, { key: 'type' }, { key: 'gstin' }, { key: 'state' }, { key: 'phone' }, { key: 'address' }, { key: 'balance' },
]
export type PartyMapping = Record<PartyFieldKey, number> // column index, -1 = not mapped

// Header text (lowercase, letters and digits only) -> field. Vyapar, Marg, Tally and hand-made sheets all use different words.
const SYN: Record<PartyFieldKey, string[]> = {
  name: ['partyname', 'party', 'customername', 'customer', 'name', 'ledgername', 'ledger', 'accountname', 'account', 'clientname', 'client', 'buyername', 'particulars', 'tradename', 'businessname', 'companyname', 'acname', 'retailername'],
  type: ['type', 'partytype', 'category', 'accounttype', 'group', 'ledgergroup'],
  gstin: ['gstin', 'gstno', 'gstnumber', 'gstinuin', 'gstid', 'gstregno', 'gstin', 'uin', 'taxid'],
  state: ['state', 'statename', 'placeofsupply', 'statecode', 'billingstate'],
  phone: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactno', 'contactnumber', 'telephone', 'tel', 'whatsapp', 'cell'],
  address: ['address', 'billingaddress', 'addr', 'fulladdress', 'streetaddress', 'location', 'city', 'shippingaddress'],
  balance: ['openingbalance', 'balance', 'outstanding', 'closingbalance', 'amountdue', 'receivable', 'dueamount', 'opening', 'currentbalance', 'balanceamount', 'pending'],
}

export const norm = (s: Cell): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (c: Cell): string => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString() : String(c).trim())

function score(header: string, syn: string): number {
  if (!header) return 0
  if (header === syn) return 100
  if (syn.length >= 5 && header.includes(syn)) return 60
  if (header.length >= 4 && syn.includes(header)) return 40
  return 0
}

/** The row most likely to hold the column titles (accounting reports have a few title lines first). */
export function detectHeaderRow(rows: Cell[][], scan = 15): number {
  let best = 0, bestHits = -1
  rows.slice(0, scan).forEach((r, i) => {
    const hits = r.filter((c) => Object.values(SYN).some((list) => list.some((s) => score(norm(c), s) >= 60))).length
    if (hits > bestHits) { best = i; bestHits = hits }
  })
  return best
}

export function autoMapParties(headers: Cell[]): PartyMapping {
  const m = Object.fromEntries(PARTY_FIELDS.map((f) => [f.key, -1])) as PartyMapping
  const cands: { field: PartyFieldKey; col: number; s: number }[] = []
  headers.forEach((h, col) => {
    const n = norm(h)
    for (const f of PARTY_FIELDS) {
      const s = Math.max(0, ...SYN[f.key].map((syn) => score(n, syn)))
      if (s >= 40) cands.push({ field: f.key, col, s })
    }
  })
  const used = new Set<number>()
  cands.sort((a, b) => b.s - a.s || a.col - b.col).forEach((c) => {
    if (m[c.field] === -1 && !used.has(c.col)) { m[c.field] = c.col; used.add(c.col) }
  })
  return m
}

// ---- cell parsers

const TYPE_MAP: Record<string, PartyType> = {
  customer: 'CUSTOMER', customers: 'CUSTOMER', debtor: 'CUSTOMER', debtors: 'CUSTOMER', sundrydebtors: 'CUSTOMER', sundrydebtor: 'CUSTOMER', client: 'CUSTOMER', buyer: 'CUSTOMER', retailer: 'CUSTOMER', wholesaler: 'CUSTOMER', party: 'CUSTOMER',
  department: 'DEPARTMENT', dept: 'DEPARTMENT', internal: 'DEPARTMENT', godown: 'DEPARTMENT', store: 'DEPARTMENT',
  branch: 'BRANCH', warehouse: 'BRANCH', outlet: 'BRANCH',
}
export function parseType(c: Cell): PartyType | undefined {
  const t = norm(c)
  return t ? TYPE_MAP[t] : undefined
}

const STATE_ALIASES: Record<string, string> = {
  orissa: '21', pondicherry: '34', telengana: '36', andhra: '37', andhrapradesh: '37', jammuandkashmir: '01', jk: '01', uttaranchal: '05',
  dnh: '26', damananddiu: '26', delhincr: '07', newdelhi: '07', nctofdelhi: '07', up: '09', mp: '23', hp: '02', ap: '37', tn: '33', wb: '19', ka: '29', mh: '27', gj: '24', rj: '08', kl: '32', tg: '36', br: '10', hr: '06', pb: '03', or: '21', od: '21',
}
/** A GST state from a code ("29", "7"), a name ("Karnataka", "karnataka "), or a common short form. */
export function parseState(c: Cell): string | undefined {
  const raw = text(c)
  if (!raw) return undefined
  if (/^\d{1,2}$/.test(raw)) { const code = raw.padStart(2, '0'); return STATES.some((s) => s.code === code) ? code : undefined }
  const lead = /^(\d{2})\b/.exec(raw) // "29 - Karnataka"
  if (lead && STATES.some((s) => s.code === lead[1])) return lead[1]
  const n = norm(raw.replace(/&/g, 'and'))
  const byName = STATES.find((s) => norm(s.name.replace(/&/g, 'and')) === n)
  return byName?.code ?? STATE_ALIASES[n]
}

/**
 * Money as written in accounts exports: "1,250.50", "(300)", "1250 Dr", "1250 Cr".
 * Returns paise. Dr means the party owes you (positive), Cr means you owe them (negative). A plain number is taken as owed to you.
 */
export function parseBalance(c: Cell): number | undefined | 'bad' {
  if (c === null || c === undefined) return undefined
  if (typeof c === 'number') return Number.isFinite(c) ? toPaise(c) : 'bad'
  let t = String(c).trim().replace(/[₹,\s]|rs\.?/gi, '')
  if (t === '' || t === '-') return undefined
  let sign = 1
  const suffix = /(dr|cr)$/i.exec(t)
  if (suffix) { if (suffix[1].toLowerCase() === 'cr') sign = -1; t = t.slice(0, -2) }
  if (/^\(.*\)$/.test(t)) { sign = -sign; t = t.slice(1, -1) }
  const n = Number(t)
  return Number.isFinite(n) ? toPaise(sign * n) : 'bad'
}

const cleanPhone = (c: Cell): string => {
  if (typeof c === 'number') return String(Math.round(c)) // 9876543210 typed as a number in Excel
  return text(c).replace(/[^\d+\-()\s/]/g, '').replace(/\s+/g, ' ').trim()
}

// ---- preview

export type PartyDuplicateMode = 'UPSERT' | 'SKIP'
export interface PartyImportOptions {
  mode: PartyDuplicateMode
  /** Change the balance of parties that already exist. Off by default: their balances move with every credit bill. */
  updateBalance: boolean
  /** State to give a new party when the file says nothing and there is no GSTIN (the business's own state). */
  defaultState: string
}

export interface PartyPreviewRow {
  line: number
  action: 'create' | 'update' | 'skip' | 'error'
  name: string
  note?: Msg
  warnings: Msg[]
  matchId?: string
  /** For create: every field. For update: only what the file has. */
  data: Partial<PartyData>
}

const key = (name: string) => name.trim().toLowerCase()

export function buildPartyPreview(rows: Cell[][], headerRow: number, map: PartyMapping, existing: Party[], opts: PartyImportOptions): PartyPreviewRow[] {
  const out: PartyPreviewRow[] = []
  const get = (r: Cell[], k: PartyFieldKey): Cell => (map[k] >= 0 ? r[map[k]] : undefined)
  const byName = new Map(existing.map((p) => [key(p.name), p]))
  const seen = new Map<string, PartyPreviewRow>()
  const stateName = (code: string) => STATES.find((s) => s.code === code)?.name ?? code

  rows.slice(headerRow + 1).forEach((r, idx) => {
    const line = headerRow + 2 + idx
    if (r.every((c) => text(c) === '')) return
    const name = text(get(r, 'name')).replace(/\s+/g, ' ')
    const warnings: Msg[] = []
    const base = { line, name, warnings }
    if (!name) { out.push({ ...base, action: 'error', note: { key: 'row.nameEmpty' }, data: {} }); return }
    if (name.length > 120) { out.push({ ...base, action: 'error', note: { key: 'row.nameLong' }, data: {} }); return }
    if (/^(grand\s*)?total\b/i.test(name)) { out.push({ ...base, action: 'skip', note: { key: 'row.totals' }, data: {} }); return }

    const dup = seen.get(key(name))
    if (dup) { out.push({ ...base, action: 'skip', note: { key: 'note.duplicateOf', params: { row: dup.line } }, data: {} }); return }

    const data: Partial<PartyData> = { name }

    // type
    if (map.type >= 0 && text(get(r, 'type'))) {
      const ty = parseType(get(r, 'type'))
      if (ty) data.type = ty; else warnings.push({ key: 'warn.type', params: { value: text(get(r, 'type')) } })
    }

    // GSTIN and state (the GSTIN's own state wins: the server refuses a party whose state contradicts its GSTIN)
    let gstState: string | undefined
    const gstin = text(get(r, 'gstin')).toUpperCase().replace(/\s/g, '')
    if (gstin) {
      const g = checkGstin(gstin)
      if (g.errorKey) warnings.push({ key: 'warn.gstin', params: { value: gstin } })
      else { data.gstin = gstin; gstState = g.stateCode; if (g.warningKey) warnings.push({ key: 'warn.gstinCheck', params: { value: gstin } }) }
    }
    const fileState = map.state >= 0 ? parseState(get(r, 'state')) : undefined
    if (map.state >= 0 && text(get(r, 'state')) && !fileState) warnings.push({ key: 'warn.state', params: { value: text(get(r, 'state')) } })
    if (gstState) {
      data.stateCode = gstState
      if (fileState && fileState !== gstState) warnings.push({ key: 'warn.stateFromGstin', params: { state: stateName(gstState) } })
    } else if (fileState) data.stateCode = fileState

    // phone, address
    if (map.phone >= 0) {
      let ph = cleanPhone(get(r, 'phone'))
      if (ph.length > 20) { warnings.push({ key: 'warn.phoneLong', params: { value: ph } }); ph = ph.slice(0, 20).trim() }
      if (ph) data.phone = ph
    }
    if (map.address >= 0) {
      let ad = text(get(r, 'address')).replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s+/g, ' ')
      if (ad.length > 300) { warnings.push({ key: 'warn.addressLong' }); ad = ad.slice(0, 300) }
      if (ad) data.address = ad
    }

    // balance
    let balance: number | undefined
    if (map.balance >= 0) {
      const b = parseBalance(get(r, 'balance'))
      if (b === 'bad') warnings.push({ key: 'warn.balance', params: { value: text(get(r, 'balance')) } })
      else balance = b
    }

    const hit = byName.get(key(name))
    if (hit) {
      if (opts.mode === 'SKIP') { out.push({ ...base, action: 'skip', note: { key: 'note.exists' }, data: {} }); return }
      delete data.name // the name is how it was matched; keep the stored spelling
      if (balance !== undefined && opts.updateBalance) data.balance = balance
      else if (balance !== undefined) warnings.push({ key: 'warn.balanceKept' })
      // the GSTIN must still agree with the state the party will have
      if (data.gstin && !data.stateCode) data.stateCode = checkGstin(data.gstin).stateCode ?? hit.stateCode
      const row: PartyPreviewRow = { ...base, action: 'update', matchId: hit.id, data }
      seen.set(key(name), row); out.push(row)
      return
    }

    // new party: every field has a value
    if (!data.stateCode && !opts.defaultState) { out.push({ ...base, action: 'error', note: { key: 'row.stateMissing' }, data: {} }); return }
    if (!data.stateCode) { data.stateCode = opts.defaultState; warnings.push({ key: 'warn.stateDefault', params: { state: stateName(opts.defaultState) } }) }
    const full: PartyData = { name, type: 'CUSTOMER', gstin: '', address: '', phone: '', balance: balance ?? 0, ...data, stateCode: data.stateCode }
    const row: PartyPreviewRow = { ...base, action: 'create', data: full }
    seen.set(key(name), row); out.push(row)
  })
  return out
}

export const SAMPLE_PARTIES_CSV = [
  'Party Name,Type,GSTIN,State,Mobile,Address,Opening Balance',
  'Sharma Medical Stores,Customer,29AABCS1234F1Z5,Karnataka,98450 11273,"12 Market Road, Jayanagar, Bengaluru 560011",12500 Dr',
  'Mehta Distributors,Customer,27AAFFM7743K1ZU,Maharashtra,022 2342 1199,"Shop 5, Crawford Market, Mumbai",0',
  'Hyderabad Branch,Branch,,Telangana,040 2315 7790,Plot 18 Kukatpally,0',
  'Godown Department,Department,,Karnataka,,Rear godown,0',
  'Local Walk-in Customer,,,29,9876543210,,3200',
].join('\n')
