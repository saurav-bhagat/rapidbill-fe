import { useEffect, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Input } from './Field'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  /** The word the user must type to proceed. */
  word: string
  confirmLabel: string
  children: ReactNode
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

/** For irreversible actions: the button stays disabled until the exact word is typed. */
export function TypedConfirm({ open, title, word, confirmLabel, children, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setText(''); setBusy(false) } }, [open])
  const ok = text.trim().toUpperCase() === word
  const go = async () => { if (!ok || busy) return; setBusy(true); await onConfirm() }
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="460px"
      footer={<><Button onClick={onCancel}>{t('actions.cancel')}</Button><Button variant="danger" disabled={!ok || busy} onClick={go}>{confirmLabel}</Button></>}
    >
      <div className="space-y-3">
        <div className="text-ink-600">{children}</div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-600"><Trans i18nKey="ui.typeToConfirm" ns="common" values={{ word }} components={{ w: <span className="font-mono text-ink-900" /> }} /></span>
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }} autoFocus autoComplete="off" />
        </label>
      </div>
    </Modal>
  )
}
