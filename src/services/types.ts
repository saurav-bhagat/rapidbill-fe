import type { Paise } from '@/lib/money'

export const WORKSPACE_ID = 'local_workspace'
export const LOCAL_USER = 'local_user'

export interface Meta {
  id: string
  workspaceId: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type Unit = 'PCS' | 'BOX' | 'STRIP' | 'KG' | 'LTR' | 'NOS' | 'GM' | 'ML' | 'MTR' | 'FT' | 'SQFT' | 'DOZ' | 'PKT' | 'BAG' | 'ROLL' | 'SET' | 'PAIR' | 'SHEET' | 'TON' | 'QTL'
export const UNITS: Unit[] = ['PCS', 'BOX', 'STRIP', 'KG', 'LTR', 'NOS', 'GM', 'ML', 'MTR', 'FT', 'SQFT', 'DOZ', 'PKT', 'BAG', 'ROLL', 'SET', 'PAIR', 'SHEET', 'TON', 'QTL']
export const GST_SLABS = [0, 5, 12, 18, 28] as const

/** Another unit an item is also sold in: `per` of them make 1 of the item's own (stock) unit. 1 KG = 1000 GM is { unit: 'GM', per: 1000 }. */
export interface AltUnit { unit: Unit; per: number }
export const MAX_ALT_UNITS = 3

export interface Item extends Meta {
  name: string
  code: string
  category: string
  hsn: string
  unit: Unit
  /** Other units it is also sold in (up to 3). Absent on older items. */
  altUnits?: AltUnit[]
  batchNo: string
  /** MM/YY */
  expiry: string
  mrp: Paise
  purchaseRate: Paise
  issueRate: Paise
  gstPercent: number
  currentStock: number
  lowStockThreshold: number
}

export type PartyType = 'CUSTOMER' | 'DEPARTMENT' | 'BRANCH'

export interface Party extends Meta {
  name: string
  type: PartyType
  gstin: string
  /** GST state code, e.g. "29" */
  stateCode: string
  address: string
  phone: string
  /** Positive = party owes us. */
  balance: Paise
}

export type VoucherMode = 'TAX_INVOICE' | 'CHALLAN'
export type VoucherStatus = 'ACTIVE' | 'CANCELLED'
export type PaymentStatus = 'PAID_CASH' | 'PAID_UPI' | 'PAID_BANK' | 'CREDIT' | 'INTERNAL'
/** How money came in when a credit bill was part paid, or when a receipt was entered. */
export const RECEIPT_MODES = ['CASH', 'UPI', 'BANK'] as const
export type ReceiptMode = (typeof RECEIPT_MODES)[number]

export interface VoucherLine {
  itemId: string
  name: string
  code: string
  hsn: string
  batchNo: string
  expiry: string
  /** The unit this line was sold in (the item's own unit unless sold in one of its alternates). */
  unit: Unit
  qty: number
  /** How many of `unit` make 1 of the item's own unit (1 when sold in the item's own unit). Absent on older bills. */
  per?: number
  /** The item's own unit, and how much of it left stock: qty / per. Absent on older bills (then the same as unit and qty). */
  baseUnit?: Unit
  stockQty?: number
  mrp: Paise
  rate: Paise
  discPct: number
  gstPct: number
  taxable: Paise
  tax: Paise
  total: Paise
}

export interface Voucher extends Meta {
  number: string
  /** ISO yyyy-MM-dd */
  date: string
  mode: VoucherMode
  taxApplicable: boolean
  rateBasis: 'SALE' | 'COST'
  partyId: string | null
  /** Snapshots so the invoice never changes if the party is edited later. */
  partyName: string
  partyGstin: string
  partyStateCode: string | null
  partyAddress: string
  remarks: string
  lines: VoucherLine[]
  billDiscount: { type: 'PCT' | 'AMT'; value: number } | null
  totals: {
    itemCount: number
    totalQty: number
    gross: Paise
    lineDiscount: Paise
    billDiscount: Paise
    taxable: Paise
    cgst: Paise
    sgst: Paise
    igst: Paise
    roundOff: Paise
    grandTotal: Paise
  }
  payment: PaymentStatus
  /** CREDIT bills only: what was paid when the bill was made (paise, less than the total) and how. The unpaid rest is on the party's balance. Absent = nothing paid. */
  paidAmount?: Paise
  paidMode?: ReceiptMode
  /** How much of each line has come back on active returns (in the unit it was sold in). Missing = nothing returned. */
  returned?: number[]
  status: VoucherStatus
  cancelledAt?: string
  /** When the device made the bill, if it was made offline. */
  clientCreatedAt?: string
}

/** RETURN = goods came back on a credit note; RETURN_CANCEL = that credit note was cancelled. */
export type LedgerType = 'OPENING' | 'IMPORT' | 'ISSUE' | 'CANCEL' | 'EDIT_REVERSE' | 'ADJUST' | 'RETURN' | 'RETURN_CANCEL'

export interface StockLedgerEntry extends Meta {
  itemId: string
  type: LedgerType
  qtyDelta: number
  balanceAfter: number
  voucherId?: string
  voucherNo?: string
  note?: string
}

export interface Settings extends Meta {
  /** false = non-GST business: no tax is charged anywhere and invoices print without GST columns. */
  gstEnabled: boolean
  /** Language printed on invoices and challans. Independent of the screen language. */
  printLanguage: 'en' | 'hi'
  companyName: string
  address: string
  phone: string
  gstin: string
  stateCode: string
  invoicePrefix: string
  defaultTaxMode: VoucherMode
  overIssue: 'BLOCK' | 'ALLOW_WARN'
  roundOffDefault: boolean
  paperSize: 'A4' | 'A5'
  bankName: string
  bankAccount: string
  bankIfsc: string
  upiId: string
  /** Extra business details (older accounts do not have them until saved once). */
  email?: string
  pan?: string
  /** Terms printed on invoices. Empty = the standard line. */
  terms?: string
  /** What the business sells. '' or missing = not chosen. */
  businessType?: BusinessType | ''
  /** Which parts of the printed invoice are shown. Use `invoiceFieldsOf(settings)`, which fills any gaps. */
  invoiceFields?: Partial<Record<InvoiceFieldKey, boolean>>
}

export const BUSINESS_TYPES = [
  'grocery', 'sanitary', 'plumbing', 'electrical', 'hardware', 'construction', 'paint', 'furniture',
  'pharmacy', 'stationery', 'electronics', 'clothing', 'autoparts', 'agri', 'other',
] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]

export const INVOICE_FIELD_KEYS = [
  'hsn', 'batchExpiry', 'mrp', 'unit', 'discount', 'hsnSummary', 'amountInWords', 'bank', 'upi', 'terms', 'signature',
  'partyGstin', 'partyAddress', 'placeOfSupply', 'paymentMode', 'companyPhone', 'companyEmail', 'companyPan', 'baseQty', 'taxable', 'paymentDetails', 'upiQr',
] as const
export type InvoiceFieldKey = (typeof INVOICE_FIELD_KEYS)[number]
/** Columns that are not printed unless the business turns them on, so the description keeps the room. */
export const INVOICE_FIELDS_OFF_BY_DEFAULT: readonly InvoiceFieldKey[] = ['hsn', 'batchExpiry', 'unit', 'taxable', 'hsnSummary', 'paymentDetails', 'upiQr']

/** Money received from a party. Never edited or deleted: a mistake is cancelled and entered again. */
export interface Receipt extends Meta {
  /** RC-2627-0001. Empty while the receipt is still waiting on this device to be sent (the server gives the number). */
  number: string
  date: string
  partyId: string
  partyName: string
  amount: Paise
  mode: ReceiptMode
  note: string
  status: 'ACTIVE' | 'CANCELLED'
  cancelledAt?: string
  /** Only on this device: made without a connection and not sent yet. */
  waiting?: boolean
}
export interface ReceiptInput { partyId: string; date: string; amount: Paise; mode: ReceiptMode; note: string }

export type StatementRowType = 'OPENING' | 'BILL' | 'BILL_CANCEL' | 'BILL_EDIT_REVERSE' | 'RECEIPT' | 'RECEIPT_CANCEL' | 'ADJUST' | 'RETURN' | 'RETURN_CANCEL'
export interface StatementRow {
  date: string
  type: StatementRowType
  number?: string
  voucherId?: string
  receiptId?: string
  returnId?: string
  /** Paise the party owes more. */
  debit: Paise
  /** Paise the party owes less. */
  credit: Paise
  /** Running balance after this row (positive = the party owes us). */
  balance: Paise
  /** A bill that was part paid when made: its total and the part paid then (the unpaid rest is the debit). */
  billTotal?: Paise
  paidNow?: Paise
  note?: string
  /** A cancelled part-paid bill: the money paid at billing was kept as an advance (true) or given back (false). */
  paidKept?: boolean
}
export interface Statement {
  party: { id: string; name: string; type: PartyType; gstin: string; stateCode: string; address: string; phone: string }
  from: string | null
  to: string | null
  opening: Paise
  rows: StatementRow[]
  debit: Paise
  credit: Paise
  closing: Paise
  /** The party's balance right now, whatever range was asked for. */
  balance: Paise
}
export interface ReceiptService {
  /** Lowers the party's balance. Online it is saved on the server; with no connection it is kept here and sent later (`waiting`). */
  create(input: ReceiptInput): Promise<Receipt>
  /** Cancel a receipt: the money goes back on the party's balance. A receipt still waiting here is simply dropped. */
  cancel(id: string): Promise<Receipt>
  /** Newest first. Needs the internet for receipts already on the server; receipts waiting on this device are always included. */
  listForParty(partyId: string): Promise<Receipt[]>
  /** Needs the internet. */
  statement(partyId: string, range?: { from?: string; to?: string }): Promise<Statement>
}

/** How the money for a return is settled: taken off the party's balance, or paid back. */
export const RETURN_SETTLEMENTS = ['ADJUST', 'CASH', 'UPI', 'BANK'] as const
export type ReturnSettlement = (typeof RETURN_SETTLEMENTS)[number]

export interface ReturnLine {
  /** Which line of the bill (0-based). */
  line: number
  itemId: string
  name: string
  code: string
  hsn: string
  unit: Unit
  qty: number
  per: number
  baseUnit: Unit
  stockQty: number
  rate: Paise
  discPct: number
  gstPct: number
  taxable: Paise
  tax: Paise
  total: Paise
}

/** A sales return (under GST, a credit note): goods back on a bill. Never edited: a mistake is cancelled and made again. */
export interface SalesReturn extends Meta {
  /** CN-2627-0001. Empty while it is still waiting on this device to be sent (the server gives the number). */
  number: string
  date: string
  invoiceId: string
  invoiceNo: string
  invoiceDate: string
  taxApplicable: boolean
  interState: boolean
  partyId: string | null
  partyName: string
  partyGstin: string
  partyStateCode: string | null
  partyAddress: string
  lines: ReturnLine[]
  totals: { itemCount: number; totalQty: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; roundOff: Paise; grandTotal: Paise }
  settlement: ReturnSettlement
  reason: string
  status: 'ACTIVE' | 'CANCELLED'
  cancelledAt?: string
  /** Only on this device: made without a connection and not sent yet. */
  waiting?: boolean
}
export interface ReturnInput { invoiceId: string; date: string; lines: { line: number; qty: number }[]; settlement: ReturnSettlement; reason: string }
export interface ReturnService {
  /** Goods back on a bill. Online it is saved on the server; with no connection it is kept here and sent later (`waiting`). */
  create(input: ReturnInput): Promise<SalesReturn>
  /** Cancel a return: stock goes back out and any amount taken off the balance is put back. One still waiting here is simply dropped. */
  cancel(id: string): Promise<SalesReturn>
  /** Returns against a bill, newest first. Needs the internet for ones on the server; ones waiting here are always included. */
  listForBill(invoiceId: string): Promise<SalesReturn[]>
}

/** Async service contracts. The localStorage implementations below can be swapped for an HTTP client. */
export interface Repo<T extends Meta> {
  list(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  create(data: Omit<T, keyof Meta>): Promise<T>
  update(id: string, patch: Partial<Omit<T, keyof Meta>>): Promise<T>
  remove(id: string): Promise<void>
}

export type ItemService = Repo<Item>
/** Add and change many parties in one go (a reviewed spreadsheet). All together or not at all. */
export type PartyImportOp =
  | { kind: 'create'; data: Omit<Party, keyof Meta> }
  | { kind: 'update'; id: string; patch: Partial<Omit<Party, keyof Meta>> }
export type PartyService = Repo<Party> & { importParties(ops: PartyImportOp[], source: string): Promise<{ created: number; updated: number }> }
/** `recent` (account mode only) is the last month of bills kept on this device: instant and works offline. */
export type VoucherService = Repo<Voucher> & { recent?: () => Promise<Voucher[]> }
