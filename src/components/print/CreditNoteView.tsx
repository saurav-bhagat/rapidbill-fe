import { useMemo } from 'react'
import i18n from '@/i18n'
import { invoiceFieldsOf } from '@/lib/invoiceFields'
import { formatAmount, formatDate, formatQty } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { returnTitleKey } from '@/lib/returns'
import { amountInWords } from '@/lib/words'
import type { SalesReturn, Settings } from '@/services'
import type { Paper } from './InvoiceView'

interface Props { ret: SalesReturn; settings: Settings; paper: Paper; sheet?: boolean }

const th = 'border border-neutral-400 px-1 py-0.5 text-left font-semibold'
const td = 'border border-neutral-300 px-1 py-0.5 align-top'
const n = 'text-right tabular-nums font-mono'

/**
 * The credit note (or plain sales return for a bill without GST) handed to the customer: which bill it is against, what came back,
 * the tax on it, and how the money was settled. Black on white in the business's print language, like the invoice.
 */
export function CreditNoteView({ ret: r, settings: s, paper, sheet }: Props) {
  const lang = s.printLanguage ?? 'en'
  const t = useMemo(() => i18n.getFixedT(lang, 'invoice'), [lang])
  const f = invoiceFieldsOf(s)
  const a4 = paper === 'A4'
  const taxed = r.taxApplicable
  return (
    <div
      className={`relative bg-white text-black ${sheet ? 'mx-auto border border-neutral-300 shadow-float' : ''}`}
      style={{ width: sheet ? (a4 ? '210mm' : '148mm') : '100%', minHeight: sheet ? (a4 ? '297mm' : '210mm') : undefined, padding: a4 ? '10mm' : '6mm', fontSize: a4 ? 11 : 9, lineHeight: 1.35, fontFamily: '"IBM Plex Sans", "Noto Sans Devanagari", system-ui, sans-serif' }}
    >
      {r.status === 'CANCELLED' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
          <span className="-rotate-[28deg] select-none rounded border-[6px] border-red-600/30 px-6 py-2 font-bold uppercase tracking-widest text-red-600/30" style={{ fontSize: a4 ? 72 : 48 }}>{t('cancelled')}</span>
        </div>
      )}
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <div className="font-semibold" style={{ fontSize: a4 ? 20 : 15 }}>{s.companyName}</div>
          <div className="whitespace-pre-line">{s.address}</div>
          {f.companyPhone && s.phone && <div>{t('phone', { phone: s.phone })}</div>}
          {s.gstin && <div>{t('gstin')}: <span className="font-mono">{s.gstin}</span></div>}
          {s.stateCode && <div>{t('state')}: {stateName(s.stateCode)} ({s.stateCode})</div>}
        </div>
        <div className="text-right font-bold tracking-wide" style={{ fontSize: a4 ? 18 : 13 }}>{t(`cn.${returnTitleKey(r)}`)}</div>
      </header>

      <section className="grid grid-cols-2 gap-4 border-b border-neutral-400 py-2">
        <div>
          <div className="text-neutral-500">{t('cn.issuedTo')}</div>
          <div className="font-semibold">{r.partyName}</div>
          {r.partyAddress && <div className="whitespace-pre-line">{r.partyAddress}</div>}
          {r.partyGstin && <div>{t('gstin')}: <span className="font-mono">{r.partyGstin}</span></div>}
          {r.partyStateCode && <div>{t('state')}: {stateName(r.partyStateCode)} ({r.partyStateCode})</div>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3">
          <dt className="text-neutral-500">{t(taxed ? 'cn.number' : 'cn.numberReturn')}</dt><dd className="font-mono font-semibold">{r.number || t('cn.pending')}</dd>
          <dt className="text-neutral-500">{t('cn.date')}</dt><dd>{formatDate(r.date)}</dd>
          <dt className="text-neutral-500">{t('cn.against')}</dt><dd><span className="font-mono">{r.invoiceNo}</span> · {formatDate(r.invoiceDate)}</dd>
          <dt className="text-neutral-500">{t('cn.settlement')}</dt><dd>{t(`cn.settle.${r.settlement}`)}</dd>
          {r.reason && <><dt className="text-neutral-500">{t('cn.reason')}</dt><dd>{r.reason}</dd></>}
        </dl>
      </section>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100">
            <th className={th}>{t('cols.sno')}</th>
            <th className={th}>{t('cols.description')}</th>
            {f.hsn && <th className={th}>{t('cols.hsn')}</th>}
            <th className={`${th} text-right`}>{t('cols.qty')}</th>
            <th className={`${th} text-right`}>{t('cols.rate')}</th>
            <th className={`${th} text-right`}>{taxed ? t('cols.taxable') : t('cols.amount')}</th>
            {taxed && <th className={`${th} text-right`}>{t('cols.gst')}</th>}
            <th className={`${th} text-right`}>{t('cols.total')}</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={i} style={{ breakInside: 'avoid' }}>
              <td className={td}>{i + 1}</td>
              <td className={td}>{l.name}</td>
              {f.hsn && <td className={`${td} font-mono`}>{l.hsn}</td>}
              <td className={`${td} ${n}`}>{formatQty(l.qty)} {l.unit}</td>
              <td className={`${td} ${n}`}>{l.per !== 1 ? `${formatAmount(l.rate)}/${l.baseUnit}` : formatAmount(l.rate)}</td>
              <td className={`${td} ${n}`}>{formatAmount(l.taxable)}</td>
              {taxed && <td className={`${td} ${n}`}>{l.gstPct}%</td>}
              <td className={`${td} ${n}`}>{formatAmount(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-4" style={{ breakInside: 'avoid' }}>
        <div>{f.amountInWords && <div className="mt-2"><span className="text-neutral-500">{t('amountInWords')}</span><span className="font-semibold">{amountInWords(r.totals.grandTotal, lang)}</span></div>}</div>
        <table className="border-collapse self-start" style={{ minWidth: a4 ? '62mm' : '48mm' }}>
          <tbody>
            <tr><td className="py-px pr-4">{taxed ? t('totals.taxableValue') : t('totals.netAmount')}</td><td className={n}>{formatAmount(r.totals.taxable)}</td></tr>
            {taxed && (r.interState
              ? <tr><td className="py-px pr-4">{t('totals.igst')}</td><td className={n}>{formatAmount(r.totals.igst)}</td></tr>
              : <><tr><td className="py-px pr-4">{t('totals.cgst')}</td><td className={n}>{formatAmount(r.totals.cgst)}</td></tr><tr><td className="py-px pr-4">{t('totals.sgst')}</td><td className={n}>{formatAmount(r.totals.sgst)}</td></tr></>)}
            {r.totals.roundOff !== 0 && <tr><td className="py-px pr-4">{t('totals.roundOff')}</td><td className={n}>{r.totals.roundOff > 0 ? '+' : '-'}{formatAmount(Math.abs(r.totals.roundOff))}</td></tr>}
            <tr className="border-t-2 border-black font-bold" style={{ fontSize: a4 ? 14 : 11 }}><td className="pr-4 pt-1">{t('cn.total')}</td><td className={`${n} pt-1`}>₹{formatAmount(r.totals.grandTotal)}</td></tr>
          </tbody>
        </table>
      </div>

      <footer className="mt-6 flex justify-end border-t border-neutral-400 pt-2" style={{ breakInside: 'avoid' }}>
        <div className="flex flex-col items-end text-right">
          <div>{t('for')} <span className="font-semibold">{s.companyName}</span></div>
          {f.signature && <div className="mt-8 border-t border-neutral-500 px-6 pt-1">{t('signatory')}</div>}
        </div>
      </footer>
    </div>
  )
}
