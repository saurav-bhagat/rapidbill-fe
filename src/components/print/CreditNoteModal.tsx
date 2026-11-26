import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHotkey } from '@/lib/hotkeys'
import type { SalesReturn, Settings } from '@/services'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { CreditNoteView } from './CreditNoteView'
import type { Paper } from './InvoiceView'

/** On-screen credit note plus a hidden copy in <body> that @media print reveals (same way as the invoice preview). */
export function CreditNoteModal({ ret, settings, onClose }: { ret?: SalesReturn; settings?: Settings; onClose: () => void }) {
  const { t } = useTranslation('register')
  const open = !!ret && !!settings
  const [paper, setPaper] = useState<Paper>('A4')
  useEffect(() => { if (settings) setPaper(settings.paperSize) }, [settings, ret?.id])
  useEffect(() => {
    if (!open) return
    const el = document.createElement('style')
    el.textContent = `@page { size: ${paper}; margin: 0; }`
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [open, paper])
  const print = () => window.print()
  useHotkey('mod+p', print, { scope: 'modal', enabled: open })
  if (!ret || !settings) return null
  return (
    <>
      <Modal open onClose={onClose} title={t('returns.printTitle', { number: ret.number || ret.invoiceNo })} width="min(960px, 96vw)"
        footer={<>
          <Segmented label={t('print.paperSize', { ns: 'billing' })} value={paper} onChange={setPaper} options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: t('print.a5', { ns: 'billing' }) }]} />
          <span className="flex-1" />
          <Button onClick={onClose}>{t('print.close', { ns: 'billing' })}</Button>
          <Button variant="primary" icon={<Printer size={14} />} hotkey="mod+p" onClick={print} autoFocus>{t('print.printPdf', { ns: 'billing' })}</Button>
        </>}
      >
        {ret.waiting && <p className="mb-3 rounded border border-line bg-warn-soft px-3 py-2 text-sm text-warn">{t('returns.waitingNote')}</p>}
        <div className="overflow-auto rounded bg-sunken p-4"><CreditNoteView ret={ret} settings={settings} paper={paper} sheet /></div>
      </Modal>
      {createPortal(<div id="print-root" className="hidden"><CreditNoteView ret={ret} settings={settings} paper={paper} /></div>, document.body)}
    </>
  )
}
