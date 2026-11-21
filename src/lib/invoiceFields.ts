import { INVOICE_FIELD_KEYS, type InvoiceFieldKey, type Settings } from '@/services/types'

/** Every field is shown unless the business turned it off. A missing key (older account) counts as shown. */
export function invoiceFieldsOf(s: Pick<Settings, 'invoiceFields'>): Record<InvoiceFieldKey, boolean> {
  return Object.fromEntries(INVOICE_FIELD_KEYS.map((k) => [k, s.invoiceFields?.[k] !== false])) as Record<InvoiceFieldKey, boolean>
}
