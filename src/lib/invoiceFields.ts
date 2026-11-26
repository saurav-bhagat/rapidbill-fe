import { INVOICE_FIELD_KEYS, INVOICE_FIELDS_OFF_BY_DEFAULT, type InvoiceFieldKey, type Settings } from '@/services/types'

/** Every field is shown unless the business turned it off. A missing key counts as shown, except the columns that start off (HSN, batch / expiry, unit, taxable amount, HSN-wise tax summary). */
export function invoiceFieldsOf(s: Pick<Settings, 'invoiceFields'>): Record<InvoiceFieldKey, boolean> {
  return Object.fromEntries(INVOICE_FIELD_KEYS.map((k) => [k, INVOICE_FIELDS_OFF_BY_DEFAULT.includes(k) ? s.invoiceFields?.[k] === true : s.invoiceFields?.[k] !== false])) as Record<InvoiceFieldKey, boolean>
}
