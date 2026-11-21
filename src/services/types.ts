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

export type Unit = 'PCS' | 'BOX' | 'STRIP' | 'KG' | 'LTR' | 'NOS'
export const UNITS: Unit[] = ['PCS', 'BOX', 'STRIP', 'KG', 'LTR', 'NOS']
export const GST_SLABS = [0, 5, 12, 18, 28] as const

export interface Item extends Meta {
  name: string
  code: string
  category: string
  hsn: string
  unit: Unit
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

export interface VoucherLine {
  itemId: string
  name: string
  code: string
  hsn: string
  batchNo: string
  expiry: string
  unit: Unit
  qty: number
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
  status: VoucherStatus
  cancelledAt?: string
  /** When the device made the bill, if it was made offline. */
  clientCreatedAt?: string
}

export type LedgerType = 'OPENING' | 'IMPORT' | 'ISSUE' | 'CANCEL' | 'EDIT_REVERSE' | 'ADJUST'

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
  /** Which parts of the printed invoice are shown. Use `invoiceFieldsOf(settings)`, which fills any gaps. */
  invoiceFields?: Partial<Record<InvoiceFieldKey, boolean>>
}

export const INVOICE_FIELD_KEYS = [
  'hsn', 'batchExpiry', 'mrp', 'unit', 'discount', 'hsnSummary', 'amountInWords', 'bank', 'upi', 'terms', 'signature',
  'partyGstin', 'partyAddress', 'placeOfSupply', 'paymentMode', 'companyPhone', 'companyEmail', 'companyPan',
] as const
export type InvoiceFieldKey = (typeof INVOICE_FIELD_KEYS)[number]

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
