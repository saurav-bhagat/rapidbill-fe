import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHotkey } from '@/lib/hotkeys'
import type { Settings, Voucher } from '@/services'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { InvoiceView, type Paper } from './InvoiceView'

interface Props {
  voucher?: Voucher
  settings?: Settings
  onClose: () => void
  /** Shown above the sheet, e.g. "Saved". */
  banner?: string
  closeLabel?: string
}

/** On-screen sheet inside a modal + a hidden, full-bleed copy in <body> that @media print reveals. */
export function PrintPreviewModal({ voucher, settings, onClose, banner, closeLabel }: Props) {
  const { t } = useTranslation('billing')
  const open = !!voucher && !!settings
  const [paper, setPaper] = useState<Paper>('A4')
  useEffect(() => { if (settings) setPaper(settings.paperSize) }, [settings, voucher?.id])

  // @page size can't be driven by a class, so inject it while the preview is open.
  useEffect(() => {
    if (!open) return
    const el = document.createElement('style')
    el.textContent = `@page { size: ${paper}; margin: 0; }`
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [open, paper])

  const print = () => window.print()
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
            <Segmented label={t('print.paperSize')} value={paper} onChange={setPaper} options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: t('print.a5') }]} />
            <span className="flex-1" />
            <Button onClick={onClose}>{closeLabel ?? t('print.close')}</Button>
            <Button variant="primary" icon={<Printer size={14} />} hotkey="mod+p" onClick={print} autoFocus>{t('print.printPdf')}</Button>
          </>
        }
      >
        {banner && <p className="mb-3 rounded border border-line bg-ok-soft px-3 py-2 text-sm text-ok">{banner}</p>}
        <div className="overflow-auto rounded bg-sunken p-4">
          <InvoiceView voucher={voucher} settings={settings} paper={paper} sheet />
        </div>
      </Modal>
      {createPortal(
        <div id="print-root" className="hidden"><InvoiceView voucher={voucher} settings={settings} paper={paper} /></div>,
        document.body,
      )}
    </>
  )
}
