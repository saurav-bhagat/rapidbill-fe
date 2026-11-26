import { forwardRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { paymentLabel } from '@/lib/invoice'
import { amountInWords } from '@/lib/words'
import type { CalcResult } from '@/lib/calc'
import { formatAmount, formatQty } from '@/lib/format'
import { RECEIPT_MODES, type PaymentStatus, type ReceiptMode } from '@/services'
import { Button } from '../ui/Button'
import { Keycap } from '../ui/Keycap'

const PAYMENT_CODES: PaymentStatus[] = ['PAID_CASH', 'PAID_UPI', 'PAID_BANK', 'CREDIT', 'INTERNAL']

interface Props {
  calc: CalcResult
  taxApplicable: boolean
  /** false = non-GST business: show no tax lines at all */
  gstEnabled?: boolean
  billDisc: string
  onBillDisc: (v: string) => void
  onBillDiscEnter: () => void
  billDiscInvalid: boolean
  roundOff: boolean
  onRoundOff: (v: boolean) => void
  payment: PaymentStatus
  onPayment: (p: PaymentStatus) => void
  /** Credit bills: money received now (rupees as typed), how it was paid, and whether the text is not an amount. */
  paidNow: string
  onPaidNow: (v: string) => void
  paidMode: ReceiptMode
  onPaidMode: (m: ReceiptMode) => void
  paidInvalid: boolean
  /** Paise of the bill still unpaid after what was received now. */
  due: number
  paidInputRef?: Ref<HTMLInputElement>
  /** Set when money is being paid by UPI now: opens the QR for the customer to scan. */
  onShowQr?: () => void
  saving: boolean
  onSavePrint: () => void
  onSaveNew: () => void
  onDiscard: () => void
}

const Stat = ({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) => (
  <div className="flex items-baseline gap-1.5 whitespace-nowrap text-sm">
    <span className="text-ink-600">{label}</span>
    <span className={`num !text-left ${strong ? 'font-semibold' : 'font-medium'} ${tone ?? ''}`}>{value}</span>
  </div>
)

export const TotalsFooter = forwardRef<HTMLInputElement, Props>(function TotalsFooter(p, billDiscRef) {
  const { t, i18n } = useTranslation('billing')
  const words = (p: number) => amountInWords(p, i18n.language === 'hi' ? 'hi' : 'en')
  const c = p.calc
  return (
    <div className="shrink-0 rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-line px-3 py-1">
        <Stat label={t('totals.itemsQty')} value={`${c.itemCount} / ${formatQty(c.totalQty)}`} />
        <Stat label={t('totals.gross')} value={formatAmount(c.gross)} />
        {c.lineDiscount > 0 && <Stat label={t('totals.lineDiscount')} value={`-${formatAmount(c.lineDiscount)}`} />}
        {c.billDiscount > 0 && <Stat label={t('totals.billDiscount')} value={`-${formatAmount(c.billDiscount)}`} />}
        <Stat label={t('totals.taxable')} value={formatAmount(c.taxable)} strong />
        {p.taxApplicable && (c.interState
          ? <Stat label="IGST" value={formatAmount(c.igst)} />
          : <><Stat label="CGST" value={formatAmount(c.cgst)} /><Stat label="SGST" value={formatAmount(c.sgst)} /></>)}
        {!p.taxApplicable && p.gstEnabled !== false && <Stat label={t('totals.tax')} value={t('totals.notApplied')} tone="text-ink-400" />}
        {c.roundOff !== 0 && <Stat label={t('totals.roundOffStat')} value={`${c.roundOff > 0 ? '+' : c.roundOff < 0 ? '-' : ''}${formatAmount(Math.abs(c.roundOff))}`} tone="text-ink-600" />}
        <div className="ml-auto flex items-center gap-5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={p.roundOff} onChange={(e) => p.onRoundOff(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
            {t('totals.roundOff')}
          </label>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink-600">{t('totals.grandTotal')}</span>
          <span className="num text-2xl font-bold leading-8" aria-live="polite">{formatAmount(c.grandTotal)}</span>
        </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-1.5">
        <label className="flex items-center gap-2 text-sm text-ink-600">
          {t('totals.payment')}
          <select value={p.payment} onChange={(e) => p.onPayment(e.target.value as PaymentStatus)} className="h-8 rounded border border-line bg-surface px-2 text-base text-ink-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            {PAYMENT_CODES.map((k) => <option key={k} value={k}>{paymentLabel(k, t)}</option>)}
          </select>
        </label>
        {p.payment === 'CREDIT' && (
          <>
            <label className="flex items-center gap-2 text-sm text-ink-600">
              {t('totals.receivedNow')}
              <input
                ref={p.paidInputRef}
                value={p.paidNow}
                onChange={(e) => p.onPaidNow(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                aria-invalid={p.paidInvalid}
                className={`num h-8 w-24 rounded border bg-surface px-2 text-base text-ink-900 focus:outline-none focus:ring-1 focus:ring-primary ${p.paidInvalid ? 'border-danger' : 'border-line focus:border-primary'}`}
              />
            </label>
            {p.paidNow.trim() !== '' && !p.paidInvalid && (
              <select value={p.paidMode} onChange={(e) => p.onPaidMode(e.target.value as ReceiptMode)} aria-label={t('totals.receivedHow')} className="h-8 rounded border border-line bg-surface px-2 text-base text-ink-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                {RECEIPT_MODES.map((m) => <option key={m} value={m}>{t(`totals.mode.${m}`)}</option>)}
              </select>
            )}
            <Stat label={t('totals.balanceDue')} value={formatAmount(p.due)} strong />
          </>
        )}
        {p.onShowQr && <Button onClick={p.onShowQr} data-testid="show-upi-qr">{t('upiQr.show')}</Button>}
        <label className="flex items-center gap-2 text-sm text-ink-600">
          {t('totals.billDiscount')} <Keycap combo="f4" />
          <input
            ref={billDiscRef}
            value={p.billDisc}
            onChange={(e) => p.onBillDisc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.onBillDiscEnter() } }}
            placeholder={t('totals.billDiscountPlaceholder')}
            aria-invalid={p.billDiscInvalid}
            className={`num h-8 w-24 rounded border bg-surface px-2 text-base text-ink-900 focus:outline-none focus:ring-1 focus:ring-primary ${p.billDiscInvalid ? 'border-danger' : 'border-line focus:border-primary'}`}
          />
        </label>
        <p className="hidden min-w-0 flex-1 truncate text-sm text-ink-600 xl:block" title={words(c.grandTotal)}>{c.grandTotal ? words(c.grandTotal) : ''}</p>
        <div className="ml-auto flex gap-2">
          <Button className="[&>span]:hidden min-[1200px]:[&>span]:inline" onClick={p.onDiscard} hotkey="escape">{t('totals.discard')}</Button>
          <Button className="[&>span]:hidden min-[1200px]:[&>span]:inline" onClick={p.onSaveNew} hotkey="mod+enter" disabled={p.saving}>{t('totals.saveNew')}</Button>
          <Button variant="primary" className="[&>span]:hidden min-[1200px]:[&>span]:inline" onClick={p.onSavePrint} hotkey="mod+s" disabled={p.saving}>{t('totals.savePrint')}</Button>
        </div>
      </div>
    </div>
  )
})
