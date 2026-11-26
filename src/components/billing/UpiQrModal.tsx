import { useTranslation } from 'react-i18next'
import { formatINR } from '@/lib/format'
import { isUpiId, qrSvg, upiLink } from '@/lib/qr'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

/**
 * A big UPI QR on the screen for the customer to scan at the counter, for the amount being paid now. Needs only the shop's UPI ID
 * (not the print setting). The phone app shows the same sheet from the bill review.
 */
export function UpiQrModal({ open, amount, upiId, shop, onClose }: { open: boolean; amount: number; upiId: string; shop: string; onClose: () => void }) {
  const { t } = useTranslation('billing')
  const ok = isUpiId(upiId)
  return (
    <Modal open={open} onClose={onClose} title={t('upiQr.title')} width="420px" footer={<Button variant="primary" onClick={onClose} autoFocus>{t('upiQr.done')}</Button>}>
      {ok ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="num text-3xl font-bold" data-testid="upi-qr-amount">{formatINR(amount)}</div>
          <div className="rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg(upiLink({ pa: upiId, pn: shop, am: amount }), 260) }} />
          <div className="text-base font-medium">{shop}</div>
          <div className="font-mono text-sm text-ink-600">{upiId.trim()}</div>
          <p className="text-sm text-ink-600">{t('upiQr.hint')}</p>
        </div>
      ) : (
        <p className="text-base text-ink-600">{t('upiQr.noUpi')}</p>
      )}
    </Modal>
  )
}
