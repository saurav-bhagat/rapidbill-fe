import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHotkey } from '@/lib/hotkeys'
import { useAsync } from '@/lib/useAsync'
import { billWhatsAppLink, billWhatsAppText } from '@/lib/whatsapp'
import { services } from '@/services'
import type { Settings, Voucher } from '@/services'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { InvoiceView, type Paper } from './InvoiceView'
import { ReceiptView } from './ReceiptView'

/** What is being printed on: a sheet of paper, or a receipt roll (58 or 80 mm). */
type Sheet = Paper | 'R80' | 'R58'
const SHEET_KEY = 'rapidbill:print-sheet'
const isSheet = (x: unknown): x is Sheet => x === 'A4' || x === 'A5' || x === 'R80' || x === 'R58'
/** A counter that prints receipts should not have to pick the roll every time: the last choice on this computer is kept. */
const savedSheet = (): Sheet | null => { try { const v = localStorage.getItem(SHEET_KEY); return isSheet(v) ? v : null } catch { return null } }

interface Props {
  voucher?: Voucher
  settings?: Settings
  onClose: () => void
  /** Shown above the sheet, e.g. "Saved". */
  banner?: string
  closeLabel?: string
  /** A reprint: what is still due on the bill today (see dueToday). Undefined = as at billing. */
  dueNow?: number
}

/** On-screen sheet inside a modal + a hidden, full-bleed copy in <body> that @media print reveals. */
export function PrintPreviewModal({ voucher, settings, onClose, banner, closeLabel, dueNow }: Props) {
  const { t } = useTranslation('billing')
  const open = !!voucher && !!settings
  const [sheet, setSheet] = useState<Sheet>('A4')
  useEffect(() => { if (settings) setSheet(savedSheet() ?? settings.paperSize) }, [settings, voucher?.id])
  const choose = (s: Sheet) => { setSheet(s); try { localStorage.setItem(SHEET_KEY, s) } catch { /* private mode: the choice just is not kept */ } }
  const receipt = sheet === 'R80' || sheet === 'R58'
  const paper: Paper = sheet === 'A5' ? 'A5' : 'A4'
  // the party's phone, to open the chat with them
  const party = useAsync(() => (voucher?.partyId ? services.parties.get(voucher.partyId) : Promise.resolve(undefined)), [voucher?.partyId])

  // @page size can't be driven by a class, so inject it while the preview is open.
  useEffect(() => {
    if (!open) return
    const el = document.createElement('style')
    // a receipt roll takes its length from the content and its width from the printer chosen in the print window
    el.textContent = receipt ? '@page { margin: 0; }' : `@page { size: ${paper}; margin: 0; }`
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [open, paper, receipt])

  const print = () => window.print()
  const whatsapp = () => {
    if (!voucher || !settings) return
    const text = billWhatsAppText(voucher, settings.companyName, settings.upiId, (k, o) => t(k, o ?? {}), dueNow)
    window.open(billWhatsAppLink(party.data?.phone ?? '', text), '_blank', 'noopener')
  }
  useHotkey('mod+p', print, { scope: 'modal', enabled: open })

  if (!voucher || !settings) return null
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t(voucher.mode === 'CHALLAN' ? 'print.titleChallan' : voucher.taxApplicable ? 'print.titleTaxInvoice' : 'print.titleInvoice', { number: voucher.number })}
        width="min(960px, 96vw)"
        footer={
          <>
            <Segmented label={t('print.paperSize')} value={sheet} onChange={choose} options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: t('print.a5') }, { value: 'R80', label: t('print.thermal80') }, { value: 'R58', label: t('print.thermal58') }]} />
            <span className="flex-1" />
            <Button icon={<MessageCircle size={14} />} onClick={whatsapp}>{t('print.whatsapp')}</Button>
            <Button onClick={onClose}>{closeLabel ?? t('print.close')}</Button>
            <Button variant="primary" icon={<Printer size={14} />} hotkey="mod+p" onClick={print} autoFocus>{t('print.printPdf')}</Button>
          </>
        }
      >
        {banner && <p className="mb-3 rounded border border-line bg-ok-soft px-3 py-2 text-sm text-ok">{banner}</p>}
        {receipt && <p className="mb-2 text-sm text-ink-600">{t('print.receiptHint')}</p>}
        <div className="overflow-auto rounded bg-sunken p-4">
          {receipt ? <ReceiptView voucher={voucher} settings={settings} width={sheet === 'R80' ? 80 : 58} sheet dueNow={dueNow} /> : <InvoiceView voucher={voucher} settings={settings} paper={paper} sheet dueNow={dueNow} />}
        </div>
      </Modal>
      {createPortal(
        <div id="print-root" className="hidden">{receipt ? <ReceiptView voucher={voucher} settings={settings} width={sheet === 'R80' ? 80 : 58} dueNow={dueNow} /> : <InvoiceView voucher={voucher} settings={settings} paper={paper} dueNow={dueNow} />}</div>,
        document.body,
      )}
    </>
  )
}
