import { dueOf } from './invoice'
import { formatINR } from './format'
import { whatsappUrl } from './phone'
import type { Voucher } from '@/services/types'

type T = (key: string, opts?: Record<string, unknown>) => string

/**
 * The message sent with a bill on WhatsApp. A browser cannot attach a file to a WhatsApp chat, so the message carries the facts:
 * who, which bill, how much, and (on a credit bill) what is still due and how to pay it.
 */
export function billWhatsAppText(v: Voucher, shop: string, upiId: string | undefined, t: T, dueNow?: number): string {
  const base = t('print.waText', { name: v.partyName, number: v.number, amount: formatINR(v.totals.grandTotal), shop })
  const due = dueNow ?? dueOf(v) // a reprint: what is due today
  if (v.payment !== 'CREDIT' || due <= 0) return base
  const pay = upiId?.trim() ? ` ${t('print.waPay', { upi: upiId.trim() })}` : ''
  return `${base} ${t('print.waDue', { due: formatINR(due) })}${pay}`
}

/** A chat with the party when their number is known; otherwise WhatsApp opens and asks who to send it to. */
export const billWhatsAppLink = (phone: string, text: string): string => whatsappUrl(phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`
