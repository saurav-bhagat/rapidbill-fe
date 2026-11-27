import type React from 'react'
import { Fragment, useMemo } from 'react'
import i18n from '@/i18n'
import { docTitleKey, dueOf, hsnSummary, isInterState } from '@/lib/invoice'
import { invoiceFieldsOf } from '@/lib/invoiceFields'
import { layoutColumns } from '@/lib/invoiceLayout'
import { formatAmount, formatDate, formatQty } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { billQrAmount, isUpiId, qrSvg, upiLink } from '@/lib/qr'
import { amountInWords } from '@/lib/words'
import type { Settings, Voucher } from '@/services'

type Line = Voucher['lines'][number]
interface Col { key: string; head: string; right?: boolean; mono?: boolean; grow?: boolean; wrap?: boolean; cell: (l: Line, i: number) => React.ReactNode }

export type Paper = 'A4' | 'A5'

interface Props { voucher: Voucher; settings: Settings; paper: Paper; /** true = fixed-size sheet for on-screen preview */ sheet?: boolean; /** A reprint: what is still due on the bill today (see dueToday). Undefined = as at billing. */ dueNow?: number }

const th = 'border border-neutral-400 px-1 py-0.5 text-left font-semibold [overflow-wrap:anywhere]'
const td = 'border border-neutral-300 px-1 py-0.5 align-top [overflow-wrap:anywhere]'
const n = 'text-right tabular-nums font-mono'

/**
 * GST invoice / stock issue challan. Black on white, no app theme, so it prints the same everywhere.
 * Its language is the business's print language (Settings), not the screen language, so a Hindi screen can still print English bills.
 */
export function InvoiceView({ voucher: v, settings: s, paper, sheet, dueNow: dueLater }: Props) {
  const lang = s.printLanguage ?? 'en'
  const t = useMemo(() => i18n.getFixedT(lang, 'invoice'), [lang])
  const taxed = v.taxApplicable
  const inter = isInterState(v, s.stateCode)
  const pos = v.partyStateCode ?? s.stateCode
  const discount = v.totals.lineDiscount + v.totals.billDiscount
  const a4 = paper === 'A4'
  const f = invoiceFieldsOf(s)
  // a line sold in another unit can also show what it took from stock: 900 GM (0.9 KG)
  const both = (l: Voucher['lines'][number]) => f.baseQty && (l.per ?? 1) !== 1
  const own = (l: Voucher['lines'][number]) => `${formatQty(l.stockQty ?? l.qty)} ${l.baseUnit ?? ''}`.trim()
  // with the unit column off, the unit goes with the quantity (12 PCS) so the bill never loses it
  const qtyText = (l: Line) => (f.unit ? formatQty(l.qty) : `${formatQty(l.qty)} ${l.unit}${both(l) ? ` (${own(l)})` : ''}`)
  const cols: Col[] = ([
    { key: 'sno', head: t('cols.sno'), cell: (_l, i) => i + 1 },
    { key: 'desc', head: t('cols.description'), grow: true, cell: (l) => l.name },
    f.hsn && { key: 'hsn', head: t('cols.hsn'), mono: true, cell: (l) => l.hsn },
    f.batchExpiry && { key: 'batch', head: t('cols.batchExp'), mono: true, wrap: true, cell: (l) => `${l.batchNo}${l.expiry ? ` / ${l.expiry}` : ''}` },
    { key: 'qty', head: t('cols.qty'), right: true, cell: (l) => qtyText(l) },
    f.unit && { key: 'unit', head: t('cols.unit'), wrap: true, cell: (l) => (both(l) ? `${l.unit} (${own(l)})` : l.unit) },
    f.mrp && { key: 'mrp', head: t('cols.mrp'), right: true, cell: (l) => formatAmount(l.mrp) },
    { key: 'rate', head: t('cols.rate'), right: true, cell: (l) => ((l.per ?? 1) !== 1 ? `${formatAmount(l.rate)}/${l.baseUnit ?? ''}` : formatAmount(l.rate)) },
    f.discount && v.lines.some((l) => l.discPct) && { key: 'disc', head: t('cols.disc'), right: true, cell: (l) => (l.discPct ? l.discPct : '-') },
    f.taxable && { key: 'taxable', head: taxed ? t('cols.taxable') : t('cols.amount'), right: true, cell: (l) => formatAmount(l.taxable) },
    taxed && { key: 'gst', head: t('cols.gst'), right: true, cell: (l) => `${l.gstPct}%` },
    { key: 'total', head: t('cols.total'), right: true, cell: (l) => formatAmount(l.total) },
  ] as (Col | false)[]).filter((c): c is Col => !!c)
  // numbers and codes get the width they need, the description takes the rest and wraps (see invoiceLayout)
  const layout = layoutColumns(cols.map((c) => ({ head: c.head, grow: c.grow, wrap: c.wrap, cells: v.lines.map((l, i) => String(c.cell(l, i) ?? '')) })), paper)
  // a QR code to pay what is still due: only on a credit bill that has something due, when the business turned it on and has a real UPI ID
  const billed = dueOf(v)
  const dueNow = dueLater ?? billed
  const qrAmount = billQrAmount(v, dueNow)
  const upiQr = f.upiQr && qrAmount > 0 && isUpiId(s.upiId ?? '') ? qrSvg(upiLink({ pa: s.upiId, pn: s.companyName, am: qrAmount, tn: v.number }), a4 ? 104 : 84) : ''
  const hsnRows = taxed && f.hsnSummary ? hsnSummary(v, s.stateCode) : []
  const hsnSum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'tax') => hsnRows.reduce((a, r) => a + r[k], 0)
  const showPhone = f.companyPhone && s.phone
  const showEmail = f.companyEmail && s.email
  const showPan = f.companyPan && s.pan

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
          <div>{[showPhone && t('phone', { phone: s.phone }), showEmail && s.email].filter(Boolean).join(' · ')}</div>
          <div>{s.gstin && <>{t('gstin')}: <span className="font-mono">{s.gstin}</span></>}{showPan && <>{s.gstin && ' · '}PAN: <span className="font-mono">{s.pan}</span></>}</div>
          {s.stateCode && <div>{t('state')}: {stateName(s.stateCode)} ({s.stateCode})</div>}
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
          {f.partyAddress && v.partyAddress && <div className="whitespace-pre-line">{v.partyAddress}</div>}
          {f.partyGstin && v.partyGstin && <div>{t('gstin')}: <span className="font-mono">{v.partyGstin}</span></div>}
          {v.partyStateCode && <div>{t('state')}: {stateName(v.partyStateCode)} ({v.partyStateCode})</div>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3">
          <dt className="text-neutral-500">{t('voucherNo')}</dt><dd className="font-mono font-semibold">{v.number}</dd>
          <dt className="text-neutral-500">{t('date')}</dt><dd>{formatDate(v.date)}</dd>
          {taxed && f.placeOfSupply && pos && <><dt className="text-neutral-500">{t('placeOfSupply')}</dt><dd>{stateName(pos)} ({pos})</dd></>}
          {taxed && f.reverseCharge && <><dt className="text-neutral-500">{t('reverseCharge')}</dt><dd>{t('reverseChargeNo')}</dd></>}
          {f.paymentMode && <><dt className="text-neutral-500">{t('payment')}</dt><dd>{t(`payments.${v.payment}`)}</dd></>}
          {v.remarks && <><dt className="text-neutral-500">{t('reference')}</dt><dd>{v.remarks}</dd></>}
        </dl>
      </section>

      <table className="mt-2 w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: layout.font }}>
        <colgroup>{cols.map((c, i) => <col key={c.key} style={{ width: `${layout.widths[i].toFixed(2)}%` }} />)}</colgroup>
        <thead>
          <tr className="bg-neutral-100">{cols.map((c) => <th key={c.key} className={`${th} ${c.right ? 'text-right' : ''}`}>{c.head}</th>)}</tr>
        </thead>
        <tbody>
          {v.lines.map((l, i) => (
            <tr key={i} style={{ breakInside: 'avoid' }}>
              {cols.map((c) => <td key={c.key} className={`${td} ${c.right ? n : c.mono ? 'font-mono' : ''} ${c.grow || c.wrap || layout.tight ? '' : 'whitespace-nowrap [overflow-wrap:normal]'}`}>{c.cell(l, i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      {hsnRows.length > 0 && (
        <table className="mt-2 w-full border-collapse" style={{ breakInside: 'avoid', fontSize: a4 ? 10 : 8 }}>
          <thead>
            <tr className="bg-neutral-100">
              <th rowSpan={2} className={th}>{t('cols.hsn')}</th>
              <th rowSpan={2} className={`${th} text-right`}>{t('hsn.taxable')}</th>
              {inter ? <th colSpan={2} className={`${th} text-center`}>{t('hsn.igst')}</th> : <><th colSpan={2} className={`${th} text-center`}>{t('hsn.cgst')}</th><th colSpan={2} className={`${th} text-center`}>{t('hsn.sgst')}</th></>}
              <th rowSpan={2} className={`${th} text-right`}>{t('hsn.totalTax')}</th>
            </tr>
            <tr className="bg-neutral-100">
              {(inter ? [0] : [0, 1]).map((i) => <Fragment key={i}><th className={`${th} text-right`}>{t('hsn.rate')}</th><th className={`${th} text-right`}>{t('hsn.amt')}</th></Fragment>)}
            </tr>
          </thead>
          <tbody>
            {hsnRows.map((r) => (
              <tr key={`${r.hsn}|${r.gstPct}`}>
                <td className={`${td} font-mono`}>{r.hsn}</td>
                <td className={`${td} ${n}`}>{formatAmount(r.taxable)}</td>
                {inter
                  ? <><td className={`${td} ${n}`}>{r.gstPct}%</td><td className={`${td} ${n}`}>{formatAmount(r.igst)}</td></>
                  : <><td className={`${td} ${n}`}>{r.gstPct / 2}%</td><td className={`${td} ${n}`}>{formatAmount(r.cgst)}</td><td className={`${td} ${n}`}>{r.gstPct / 2}%</td><td className={`${td} ${n}`}>{formatAmount(r.sgst)}</td></>}
                <td className={`${td} ${n}`}>{formatAmount(r.tax)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={td}>{t('cols.total')}</td>
              <td className={`${td} ${n}`}>{formatAmount(hsnSum('taxable'))}</td>
              {inter
                ? <><td className={td} /><td className={`${td} ${n}`}>{formatAmount(hsnSum('igst'))}</td></>
                : <><td className={td} /><td className={`${td} ${n}`}>{formatAmount(hsnSum('cgst'))}</td><td className={td} /><td className={`${td} ${n}`}>{formatAmount(hsnSum('sgst'))}</td></>}
              <td className={`${td} ${n}`}>{formatAmount(hsnSum('tax'))}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-4" style={{ breakInside: 'avoid' }}>
        <div>
          {f.amountInWords && <div className="mt-2"><span className="text-neutral-500">{t('amountInWords')}</span><span className="font-semibold">{amountInWords(v.totals.grandTotal, lang)}</span></div>}
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
            {f.paymentDetails && v.payment === 'CREDIT' && (
              <>
                {(v.paidAmount ?? 0) > 0 && <tr><td className="py-px pr-4">{t('totals.paid')}</td><td className={n}>{formatAmount(v.paidAmount ?? 0)}</td></tr>}
                <tr className="font-semibold"><td className="py-px pr-4">{t('totals.balanceDue')}</td><td className={n}>₹{formatAmount(billed)}</td></tr>
                {dueNow !== billed && <tr className="font-semibold"><td className="py-px pr-4">{t('totals.dueToday')}</td><td className={n}>₹{formatAmount(dueNow)}</td></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-400 pt-2" style={{ breakInside: 'avoid' }}>
        <div>
          {((f.bank && (s.bankName || s.bankAccount)) || (f.upi && s.upiId)) && <div className="font-semibold">{t('bankUpi')}</div>}
          {f.bank && s.bankName && <div>{s.bankName}</div>}
          {f.bank && s.bankAccount && <div>{t('account')} <span className="font-mono">{s.bankAccount}</span>{s.bankIfsc && <> · {t('ifsc')} <span className="font-mono">{s.bankIfsc}</span></>}</div>}
          {f.upi && s.upiId && <div>{t('upi')}: <span className="font-mono">{s.upiId}</span></div>}
          {upiQr && (
            <div className="mt-2 flex items-center gap-2" style={{ breakInside: 'avoid' }}>
              <div dangerouslySetInnerHTML={{ __html: upiQr }} />
              <div className="font-semibold">{t('scanToPay', { amount: `₹${formatAmount(qrAmount)}` })}</div>
            </div>
          )}
          {f.terms && <div className="mt-2 whitespace-pre-line text-neutral-500">{s.terms?.trim() || t('terms')}</div>}
        </div>
        <div className="flex flex-col items-end justify-between text-right">
          <div>{t('for')} <span className="font-semibold">{s.companyName}</span></div>
          {f.signature && <div className="mt-8 border-t border-neutral-500 px-6 pt-1">{t('signatory')}</div>}
        </div>
      </footer>
    </div>
  )
}
