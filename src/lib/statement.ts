import { formatDate, formatINR } from './format'
import { isUpiId, qrSvg, upiLink } from './qr'

type T = (key: string, opts?: Record<string, unknown>) => string

/**
 * The UPI QR for what the party owes at the end of the statement, when the shop prints UPI QR codes and has a valid UPI ID.
 * '' when nothing is owed. Same in the web app (src/lib/statement.ts) and the phone app (src/core/statement.ts).
 */
export function statementQr(st: { closing: number }, s: { upiId?: string; companyName: string }, upiQrOn: boolean, px: number): string {
  if (!upiQrOn || st.closing <= 0 || !isUpiId(s.upiId ?? '')) return ''
  return qrSvg(upiLink({ pa: s.upiId ?? '', pn: s.companyName, am: st.closing }), px)
}

/**
 * The WhatsApp payment reminder: who, how much is due today and from which shop, and how to pay on UPI when the shop has an ID.
 * `t` reads the reminder keys (waReminder, waPay, waThanks). Empty when the party owes nothing.
 */
export function reminderText(p: { name: string; balance: number }, shop: string, upiId: string | undefined, date: string, t: T): string {
  if (p.balance <= 0) return ''
  const pay = upiId?.trim() ? ` ${t('waPay', { upi: upiId.trim() })}` : ''
  return `${t('waReminder', { name: p.name, shop, amount: formatINR(p.balance), date: formatDate(date) })}${pay} ${t('waThanks')}`
}
