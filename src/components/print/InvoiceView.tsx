import { useMemo } from 'react'
import i18n from '@/i18n'
import { docTitleKey, hsnSummary, isInterState } from '@/lib/invoice'
import { formatAmount, formatDate, formatQty } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { amountInWords } from '@/lib/words'
import type { Settings, Voucher } from '@/services'

export type Paper = 'A4' | 'A5'

interface Props { voucher: Voucher; settings: Settings; paper: Paper; /** true = fixed-size sheet for on-screen preview */ sheet?: boolean }

const th = 'border border-neutral-400 px-1 py-0.5 text-left font-semibold'
const td = 'border border-neutral-300 px-1 py-0.5 align-top'
const n = 'text-right tabular-nums font-mono'

/**
 * GST invoice / stock issue challan. Black on white, no app theme, so it prints the same everywhere.
 * Its language is the business's print language (Settings), not the screen language, so a Hindi screen can still print English bills.
 */
export function InvoiceView({ voucher: v, settings: s, paper, sheet }: Props) {
  const lang = s.printLanguage ?? 'en'
  const t = useMemo(() => i18n.getFixedT(lang, 'invoice'), [lang])
  const taxed = v.taxApplicable
  const inter = isInterState(v, s.stateCode)
  const hsn = taxed ? hsnSummary(v, s.stateCode) : []
  const pos = v.partyStateCode ?? s.stateCode
  const discount = v.totals.lineDiscount + v.totals.billDiscount
  const a4 = paper === 'A4'

  return (
    <div
      className={`relative bg-white text-black ${sheet ? 'mx-auto border border-neutral-300 shadow-float' : ''}`}
      style={{ width: sheet ? (a4 ? '210mm' : '148mm') : '100%', minHeight: sheet ? (a4 ? '297mm' : '210mm') : undefined, padding: a4 ? '10mm' : '6mm', fontSize: a4 ? 11 : 9, lineHeight: 1.35, fontFamily: '"IBM Plex Sans", "Noto Sans Devanagari", system-ui, sans-serif' }}
    >
      {v.status === 'CANCELLED' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
          <span className="-rotate-[28deg] select-none rounded border-[6px] border-red-600/30 px-6 py-2 font-bold uppercase tracking-widest text-red-600/30" style={{ fontSize: a4 ? 72 : 48 }}>{t('cancelled')}</span>
        </div>
      )}

      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <div className="font-semibold" style={{ fontSize: a4 ? 20 : 15 }}>{s.companyName}</div>
          <div className="whitespace-pre-line">{s.address}</div>
          <div>{s.phone && <>{t('phone', { phone: s.phone })}{s.gstin && ' · '}</>}{s.gstin && <>{t('gstin')}: <span className="font-mono">{s.gstin}</span></>}</div>
          <div>{t('state')}: {stateName(s.stateCode)} ({s.stateCode})</div>
        </div>
        <div className="text-right">
          <div className="font-bold tracking-wide" style={{ fontSize: a4 ? 18 : 13 }}>{t(docTitleKey(v))}</div>
          {v.mode === 'CHALLAN' && v.payment === 'INTERNAL' && <div className="text-neutral-600">{t('internalTransfer')}</div>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 border-b border-neutral-400 py-2">
        <div>
          <div className="text-neutral-500">{v.mode === 'TAX_INVOICE' ? t('billedTo') : t('issuedTo')}</div>
          <div className="font-semibold">{v.partyName}</div>
          {v.partyAddress && <div className="whitespace-pre-line">{v.partyAddress}</div>}
          {v.partyGstin && <div>{t('gstin')}: <span className="font-mono">{v.partyGstin}</span></div>}
          {v.partyStateCode && <div>{t('state')}: {stateName(v.partyStateCode)} ({v.partyStateCode})</div>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3">
          <dt className="text-neutral-500">{t('voucherNo')}</dt><dd className="font-mono font-semibold">{v.number}</dd>
          <dt className="text-neutral-500">{t('date')}</dt><dd>{formatDate(v.date)}</dd>
          {taxed && <><dt className="text-neutral-500">{t('placeOfSupply')}</dt><dd>{stateName(pos)} ({pos})</dd></>}
          <dt className="text-neutral-500">{t('payment')}</dt><dd>{t(`payments.${v.payment}`)}</dd>
          {v.remarks && <><dt className="text-neutral-500">{t('reference')}</dt><dd>{v.remarks}</dd></>}
        </dl>
      </section>

      <table className="mt-2 w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '4%' }} /><col /><col style={{ width: '9%' }} /><col style={{ width: '12%' }} />
          <col style={{ width: '7%' }} /><col style={{ width: '6%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '6%' }} />
          <col style={{ width: '10%' }} />{taxed && <col style={{ width: '6%' }} />}<col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr className="bg-neutral-100">
            <th className={th}>{t('cols.sno')}</th><th className={th}>{t('cols.description')}</th><th className={th}>{t('cols.hsn')}</th><th className={th}>{t('cols.batchExp')}</th>
            <th className={`${th} text-right`}>{t('cols.qty')}</th><th className={th}>{t('cols.unit')}</th><th className={`${th} text-right`}>{t('cols.mrp')}</th><th className={`${th} text-right`}>{t('cols.rate')}</th><th className={`${th} text-right`}>{t('cols.disc')}</th>
            <th className={`${th} text-right`}>{taxed ? t('cols.taxable') : t('cols.amount')}</th>{taxed && <th className={`${th} text-right`}>{t('cols.gst')}</th>}<th className={`${th} text-right`}>{t('cols.total')}</th>
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l, i) => (
            <tr key={i} style={{ breakInside: 'avoid' }}>
              <td className={td}>{i + 1}</td>
              <td className={td}>{l.name}</td>
              <td className={`${td} font-mono`}>{l.hsn}</td>
              <td className={`${td} font-mono`}>{l.batchNo}{l.expiry ? ` / ${l.expiry}` : ''}</td>
              <td className={`${td} ${n}`}>{formatQty(l.qty)}</td>
              <td className={td}>{l.unit}</td>
              <td className={`${td} ${n}`}>{formatAmount(l.mrp)}</td>
              <td className={`${td} ${n}`}>{formatAmount(l.rate)}</td>
              <td className={`${td} ${n}`}>{l.discPct ? l.discPct : '-'}</td>
              <td className={`${td} ${n}`}>{formatAmount(l.taxable)}</td>
              {taxed && <td className={`${td} ${n}`}>{l.gstPct}%</td>}
              <td className={`${td} ${n}`}>{formatAmount(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-4" style={{ breakInside: 'avoid' }}>
        <div>
          {taxed && hsn.length > 0 && (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-neutral-100">
                  <th className={th} rowSpan={2}>{t('cols.hsn')}</th><th className={`${th} text-right`} rowSpan={2}>{t('hsn.taxable')}</th>
                  {inter ? <th className={`${th} text-center`} colSpan={2}>{t('hsn.igst')}</th> : <><th className={`${th} text-center`} colSpan={2}>{t('hsn.cgst')}</th><th className={`${th} text-center`} colSpan={2}>{t('hsn.sgst')}</th></>}
                  <th className={`${th} text-right`} rowSpan={2}>{t('hsn.totalTax')}</th>
                </tr>
                <tr className="bg-neutral-100">
                  {inter ? <><th className={`${th} text-right`}>{t('hsn.rate')}</th><th className={`${th} text-right`}>{t('hsn.amt')}</th></> : <><th className={`${th} text-right`}>{t('hsn.rate')}</th><th className={`${th} text-right`}>{t('hsn.amt')}</th><th className={`${th} text-right`}>{t('hsn.rate')}</th><th className={`${th} text-right`}>{t('hsn.amt')}</th></>}
                </tr>
              </thead>
              <tbody>
                {hsn.map((h) => (
                  <tr key={h.hsn + h.gstPct}>
                    <td className={`${td} font-mono`}>{h.hsn}</td><td className={`${td} ${n}`}>{formatAmount(h.taxable)}</td>
                    {inter ? <><td className={`${td} ${n}`}>{h.gstPct}%</td><td className={`${td} ${n}`}>{formatAmount(h.igst)}</td></> : <><td className={`${td} ${n}`}>{h.gstPct / 2}%</td><td className={`${td} ${n}`}>{formatAmount(h.cgst)}</td><td className={`${td} ${n}`}>{h.gstPct / 2}%</td><td className={`${td} ${n}`}>{formatAmount(h.sgst)}</td></>}
                    <td className={`${td} ${n}`}>{formatAmount(h.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-2"><span className="text-neutral-500">{t('amountInWords')}</span><span className="font-semibold">{amountInWords(v.totals.grandTotal, lang)}</span></div>
        </div>
        <table className="border-collapse self-start" style={{ minWidth: a4 ? '62mm' : '48mm' }}>
          <tbody>
            <tr><td className="py-px pr-4">{t('totals.gross')}</td><td className={n}>{formatAmount(v.totals.gross)}</td></tr>
            {discount > 0 && <tr><td className="py-px pr-4">{t('totals.discount')}</td><td className={n}>-{formatAmount(discount)}</td></tr>}
            <tr><td className="py-px pr-4">{taxed ? t('totals.taxableValue') : t('totals.netAmount')}</td><td className={n}>{formatAmount(v.totals.taxable)}</td></tr>
            {taxed && (inter
              ? <tr><td className="py-px pr-4">{t('totals.igst')}</td><td className={n}>{formatAmount(v.totals.igst)}</td></tr>
              : <><tr><td className="py-px pr-4">{t('totals.cgst')}</td><td className={n}>{formatAmount(v.totals.cgst)}</td></tr><tr><td className="py-px pr-4">{t('totals.sgst')}</td><td className={n}>{formatAmount(v.totals.sgst)}</td></tr></>)}
            {v.totals.roundOff !== 0 && <tr><td className="py-px pr-4">{t('totals.roundOff')}</td><td className={n}>{v.totals.roundOff > 0 ? '+' : '-'}{formatAmount(Math.abs(v.totals.roundOff))}</td></tr>}
            <tr className="border-t-2 border-black font-bold" style={{ fontSize: a4 ? 14 : 11 }}><td className="pr-4 pt-1">{t('totals.grandTotal')}</td><td className={`${n} pt-1`}>₹{formatAmount(v.totals.grandTotal)}</td></tr>
          </tbody>
        </table>
      </div>

      <footer className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-400 pt-2" style={{ breakInside: 'avoid' }}>
        <div>
          {(s.bankName || s.upiId) && <div className="font-semibold">{t('bankUpi')}</div>}
          {s.bankName && <div>{s.bankName}</div>}
          {s.bankAccount && <div>{t('account')} <span className="font-mono">{s.bankAccount}</span>{s.bankIfsc && <> · {t('ifsc')} <span className="font-mono">{s.bankIfsc}</span></>}</div>}
          {s.upiId && <div>{t('upi')}: <span className="font-mono">{s.upiId}</span></div>}
          <div className="mt-2 text-neutral-500">{t('terms')}</div>
        </div>
        <div className="flex flex-col items-end justify-between text-right">
          <div>{t('for')} <span className="font-semibold">{s.companyName}</span></div>
          <div className="mt-8 border-t border-neutral-500 px-6 pt-1">{t('signatory')}</div>
        </div>
      </footer>
    </div>
  )
}
