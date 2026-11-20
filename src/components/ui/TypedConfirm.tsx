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
  /** Ask for the account password too (used when the server re-checks it). */
  askPassword?: boolean
  /** Throw to keep the dialog open; the message is shown in the dialog. */
  onConfirm: (password: string) => void | Promise<void>
  onCancel: () => void
}

/** For irreversible actions: the button stays disabled until the exact word is typed. */
export function TypedConfirm({ open, title, word, confirmLabel, children, askPassword, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  const { t: ta } = useTranslation('auth')
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setText(''); setPassword(''); setError(''); setBusy(false) } }, [open])
  const ok = text.trim().toUpperCase() === word && (!askPassword || password.length > 0)
  const go = async () => {
    if (!ok || busy) return
    setBusy(true); setError('')
    try { await onConfirm(password) } catch (e) { setError(e instanceof Error ? e.message : ''); setBusy(false) }
  }
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
        {askPassword && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">{ta('danger.password')}</span>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }} autoComplete="current-password" />
            <span className="mt-1 block text-sm text-ink-400">{ta('danger.passwordHint')}</span>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
