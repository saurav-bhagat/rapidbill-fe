import { useMemo } from 'react'
import i18n from '@/i18n'
import { invoiceFieldsOf } from '@/lib/invoiceFields'
import { formatAmount, formatDate } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { statementQr } from '@/lib/statement'
import type { Settings, Statement } from '@/services'

interface Props { st: Statement; settings: Settings; today: string; sheet?: boolean }

const th = 'border border-neutral-400 px-1 py-0.5 text-left font-semibold'
const td = 'border border-neutral-300 px-1 py-0.5 align-top'
const n = 'text-right tabular-nums font-mono'

/**
 * A party's statement of account to hand over or send: every bill, payment and return in the period with a running balance, and
 * (when the shop shows a UPI QR on bills) a QR for the balance due. Black on white, A4, in the business's print language.
 * The phone app prints the same page (src/core/statementHtml.ts).
 */
export function StatementView({ st, settings: s, today, sheet }: Props) {
  const lang = s.printLanguage ?? 'en'
  const t = useMemo(() => i18n.getFixedT(lang, 'invoice'), [lang])
  const f = invoiceFieldsOf(s)
  const p = st.party
  const qr = statementQr(st, s, f.upiQr, 104)
  const to = formatDate(st.to ?? today)
  return (
    <div
      className={`bg-white text-black ${sheet ? 'mx-auto border border-neutral-300 shadow-float' : ''}`}
      style={{ width: sheet ? '210mm' : '100%', minHeight: sheet ? '297mm' : undefined, padding: '10mm', fontSize: 11, lineHeight: 1.35, fontFamily: '"IBM Plex Sans", "Noto Sans Devanagari", system-ui, sans-serif' }}
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <div className="font-semibold" style={{ fontSize: 20 }}>{s.companyName}</div>
          <div className="whitespace-pre-line">{s.address}</div>
          {f.companyPhone && s.phone && <div>{t('phone', { phone: s.phone })}</div>}
          {s.gstin && <div>{t('gstin')}: <span className="font-mono">{s.gstin}</span></div>}
        </div>
        <div className="text-right font-bold tracking-wide" style={{ fontSize: 18 }}>{t('st.title')}</div>
      </header>

      <section className="grid grid-cols-2 gap-4 border-b border-neutral-400 py-2">
        <div>
          <div className="text-neutral-500">{t('st.to')}</div>
          <div className="font-semibold">{p.name}</div>
          {p.address && <div className="whitespace-pre-line">{p.address}</div>}
          {p.phone && <div>{t('phone', { phone: p.phone })}</div>}
          {p.gstin && <div>{t('gstin')}: <span className="font-mono">{p.gstin}</span></div>}
          {p.stateCode && <div>{t('state')}: {stateName(p.stateCode)} ({p.stateCode})</div>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3">
          <dt className="text-neutral-500">{t('st.period')}</dt><dd>{st.from ? t('st.range', { from: formatDate(st.from), to }) : t('st.upTo', { to })}</dd>
          <dt className="text-neutral-500">{t('st.opening')}</dt><dd className="tabular-nums">₹{formatAmount(st.opening)}</dd>
          <dt className="text-neutral-500">{t('st.billed')}</dt><dd className="tabular-nums">₹{formatAmount(st.debit)}</dd>
          <dt className="text-neutral-500">{t('st.received')}</dt><dd className="tabular-nums">₹{formatAmount(st.credit)}</dd>
          <dt className="font-semibold">{t(st.closing >= 0 ? 'st.closing' : 'st.advance')}</dt><dd className="font-bold tabular-nums">₹{formatAmount(Math.abs(st.closing))}</dd>
        </dl>
      </section>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100">
            <th className={th}>{t('st.date')}</th>
            <th className={th}>{t('st.details')}</th>
            <th className={`${th} text-right`}>{t('st.debit')}</th>
            <th className={`${th} text-right`}>{t('st.credit')}</th>
            <th className={`${th} text-right`}>{t('st.balance')}</th>
          </tr>
        </thead>
        <tbody>
          {(st.from || st.opening !== 0) && (
            <tr className="break-inside-avoid">
              <td className={td}>{st.from ? formatDate(st.from) : ''}</td>
              <td className={td}>{t('st.forward')}</td>
              <td className={td} /><td className={td} />
              <td className={`${td} ${n}`}>{formatAmount(st.opening)}</td>
            </tr>
          )}
          {st.rows.length === 0 && <tr><td className={`${td} text-center text-neutral-500`} colSpan={5}>{t('st.empty')}</td></tr>}
          {st.rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid">
              <td className={`${td} whitespace-nowrap`}>{formatDate(r.date)}</td>
              <td className={td}>
                {t(`st.type.${r.type}`)}{r.number ? <> · <span className="font-mono">{r.number}</span></> : null}
                {r.type === 'BILL' && (r.paidNow ?? 0) > 0 && r.billTotal !== undefined && <div className="text-neutral-600">{t('st.partPaid', { total: `₹${formatAmount(r.billTotal)}`, paid: `₹${formatAmount(r.paidNow ?? 0)}` })}</div>}
                {r.type === 'BILL_CANCEL' && r.paidKept !== undefined && (r.paidNow ?? 0) > 0 && <div className="text-neutral-600">{t(r.paidKept ? 'st.paidKept' : 'st.paidBack', { paid: `₹${formatAmount(r.paidNow ?? 0)}` })}</div>}
                {r.note && <div className="text-neutral-600">{r.note}</div>}
              </td>
              <td className={`${td} ${n}`}>{r.debit ? formatAmount(r.debit) : ''}</td>
              <td className={`${td} ${n}`}>{r.credit ? formatAmount(r.credit) : ''}</td>
              <td className={`${td} ${n}`}>{formatAmount(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          {s.upiId && f.upi && <div>{t('upi')}: <span className="font-mono">{s.upiId}</span></div>}
          {qr && (
            <div className="mt-2 flex items-center gap-2" style={{ breakInside: 'avoid' }}>
              <div dangerouslySetInnerHTML={{ __html: qr }} />
              <b>{t('scanToPay', { amount: `₹${formatAmount(st.closing)}` })}</b>
            </div>
          )}
        </div>
        <div className="text-right">
          <div>{t('for')} <b>{s.companyName}</b></div>
          <div className="mt-1 text-neutral-500">{t('st.made', { date: formatDate(today) })}</div>
        </div>
      </div>
    </div>
  )
}
