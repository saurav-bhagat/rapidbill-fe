import { useMemo } from 'react'
import i18n from '@/i18n'
import { dueOf, docTitleKey, isInterState } from '@/lib/invoice'
import { invoiceFieldsOf } from '@/lib/invoiceFields'
import { formatAmount, formatDate, formatQty } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { billQrAmount, isUpiId, qrSvg, upiLink } from '@/lib/qr'
import { amountInWords } from '@/lib/words'
import type { Settings, Voucher } from '@/services'

export type ReceiptWidth = 58 | 80

interface Props { voucher: Voucher; settings: Settings; width: ReceiptWidth; /** true = shown on screen as a narrow strip */ sheet?: boolean; /** A reprint: what is still due on the bill today (see dueToday). Undefined = as at billing. */ dueNow?: number }

const Row = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}><span>{l}</span><span className="tabular-nums">{r}</span></div>
)
const Rule = () => <div className="my-1 border-t border-dashed border-black" />

/**
 * A narrow receipt for a thermal printer connected to this computer (58 or 80 mm roll). Black on white, one column, no colours,
 * so any receipt printer prints it the same way. The printer itself is chosen in the browser's print window.
 */
export function ReceiptView({ voucher: v, settings: s, width, sheet, dueNow }: Props) {
  const lang = s.printLanguage ?? 'en'
  const t = useMemo(() => i18n.getFixedT(lang, 'invoice'), [lang])
  const f = invoiceFieldsOf(s)
  const taxed = v.taxApplicable
  const inter = isInterState(v, s.stateCode)
  const discount = v.totals.lineDiscount + v.totals.billDiscount
  const due = dueOf(v)
  const qrAmount = billQrAmount(v, dueNow ?? due)
  const qr = f.upiQr && qrAmount > 0 && isUpiId(s.upiId ?? '') ? qrSvg(upiLink({ pa: s.upiId, pn: s.companyName, am: qrAmount, tn: v.number }), width === 80 ? 150 : 110) : ''
  return (
    <div
      className={`relative bg-white text-black ${sheet ? 'mx-auto border border-neutral-300 shadow-float' : ''}`}
      style={{ width: `${width}mm`, padding: '3mm', fontSize: width === 80 ? 12 : 10.5, lineHeight: 1.3, fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace' }}
    >
      <div className="text-center">
        <div className="text-base font-bold">{s.companyName}</div>
        {s.address && <div className="whitespace-pre-line">{s.address}</div>}
        {s.phone && f.companyPhone && <div>{t('phone', { phone: s.phone })}</div>}
        {s.gstin && <div>{t('gstin')}: {s.gstin}</div>}
      </div>
      <Rule />
      <div className="text-center font-bold">{t(docTitleKey(v))}{v.status === 'CANCELLED' ? ` · ${t('cancelled').toUpperCase()}` : ''}</div>
      <Row l={v.number} r={formatDate(v.date)} />
      {v.partyName && <div>{v.mode === 'TAX_INVOICE' ? t('billedTo') : t('issuedTo')}: {v.partyName}</div>}
      {v.partyGstin && <div>{t('gstin')}: {v.partyGstin}</div>}
      <Rule />
      {v.lines.map((l, i) => (
        <div key={i} className="mb-1">
          <div>{l.name}</div>
          <Row l={`  ${formatQty(l.qty)} ${l.unit} x ${formatAmount(l.rate)}${l.discPct ? ` -${l.discPct}%` : ''}`} r={formatAmount(l.total)} />
        </div>
      ))}
      <Rule />
      <Row l={`${t('totals.gross')} (${v.totals.itemCount})`} r={formatAmount(v.totals.gross)} />
      {discount > 0 && <Row l={t('totals.discount')} r={`-${formatAmount(discount)}`} />}
      {taxed && <Row l={t('totals.taxableValue')} r={formatAmount(v.totals.taxable)} />}
      {taxed && (inter
        ? <Row l={t('totals.igst')} r={formatAmount(v.totals.igst)} />
        : <><Row l={t('totals.cgst')} r={formatAmount(v.totals.cgst)} /><Row l={t('totals.sgst')} r={formatAmount(v.totals.sgst)} /></>)}
      {v.totals.roundOff !== 0 && <Row l={t('totals.roundOff')} r={`${v.totals.roundOff > 0 ? '+' : '-'}${formatAmount(Math.abs(v.totals.roundOff))}`} />}
      <Rule />
      <div className="text-sm"><Row l={t('totals.grandTotal')} r={`₹${formatAmount(v.totals.grandTotal)}`} bold /></div>
      <Rule />
      {f.amountInWords && <div>{amountInWords(v.totals.grandTotal, lang)}</div>}
      {f.paymentMode && <div>{t('payment')}: {t(`payments.${v.payment}`)}</div>}
      {f.paymentDetails && v.payment === 'CREDIT' && (
        <>
          {(v.paidAmount ?? 0) > 0 && <Row l={t('totals.paid')} r={formatAmount(v.paidAmount ?? 0)} />}
          <Row l={t('totals.balanceDue')} r={`₹${formatAmount(due)}`} bold />
          {dueNow !== undefined && dueNow !== due && <Row l={t('totals.dueToday')} r={`₹${formatAmount(dueNow)}`} bold />}
        </>
      )}
      {taxed && f.placeOfSupply && s.stateCode && <div>{t('placeOfSupply')}: {stateName(v.partyStateCode ?? s.stateCode)}</div>}
      {qr && (
        <div className="mt-2 flex flex-col items-center gap-1" style={{ breakInside: 'avoid' }}>
          <div className="font-bold">{t('scanToPay', { amount: `₹${formatAmount(qrAmount)}` })}</div>
          <div dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
      )}
      <div className="mt-2 text-center">{t('for')} {s.companyName}</div>
    </div>
  )
}
